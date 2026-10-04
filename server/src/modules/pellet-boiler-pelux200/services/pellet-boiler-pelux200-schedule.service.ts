// Harmonogram kotła (zakładka Harmonogram pieca): CWU od–do i praca kotła (włączony/wyłączony) w oknach
// godzin, osobna lista i osobne wartości poza harmonogramem dla trybu „Pompa ciepła” i „Pellet”; działa lista trybu, w którym kocioł
// jest teraz (z ostatniego odczytu ustawień: minimalna temperatura kotła nr 99 < 50 °C = pompa ciepła,
// jak w aplikacji). Serwer co minutę (startPelletBoilerScheduler, server.ts) wylicza stan dla każdego
// kotła z włączonym harmonogramem i — tylko gdy stan zmienił się od ostatnio zastosowanego
// (lastApplied) — zleca zmianę parametrów tą samą drogą co aplikacja (createCommands): zadana CWU
// nr 119 = do, histereza nr 123 = do − od, praca kotła ramką włącz/wyłącz (kind control, 0x3B).
// „Praca kotła: Wyłączony” w Ustawieniach (enabled = false) zleca wyłączenie i zatrzymuje harmonogram;
// „Włączony” wraca do harmonogramu. Włączenie albo wyłączenie nie jest zlecane, gdy kocioł już jest
// w tym stanie (stan z ostatniego odczytu: 0 wyłączony, 7 wygaszanie). Przy nakładaniu wpisów pracy
// wygrywa wpis z datą, potem wyłączenie przed włączeniem, potem późniejszy start. Zmiana ręczna w aplikacji albo na panelu zostaje do
// następnej zmiany stanu (jak ręczne nadpisanie w pompie ciepła). Okno przez północ należy do dnia
// startu (jak harmonogram włącznika); data ma pierwszeństwo przed dniem tygodnia, potem późniejszy start.
// Tu są też nastawy trybów (profiles), które aplikacja zleca po wyborze „Pompa ciepła” / „Pellet”.
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { scheduleDayMatches } from '../../../core/services/calendar.service';
import { TIME_ZONE } from '../../../core/time';
import { DeviceModel } from '../../../core/models/device.model';
import { DeviceType, WeekDay } from '../../../core/types';
import { sendMessage } from '../../../core/websocket';
import {
  PelletBoilerScheduleModel, PelletBoilerScheduleSettingsModel,
} from '../models/pellet-boiler-pelux200-schedule.model';
import { PelletBoilerSettingsEntry, PelletBoilerSettingsModel } from '../models/pellet-boiler-pelux200-settings.model';
import {
  PelletBoilerCommandChange, PelletBoilerCwuRange, PelletBoilerMode, PelletBoilerProfile, PelletBoilerScheduleEntry,
  PelletBoilerScheduleSettings, PelletBoilerScheduleState, PelletBoilerWork,
} from '../types';
import { getPelletBoilerPelux200Last } from './pellet-boiler-pelux200.service';
import { createCommands } from './pellet-boiler-pelux200-command.service';
import { buildSettingsView } from './pellet-boiler-pelux200-settings.service';

export const PELLET_SCHEDULER_INTERVAL_MS = 60 * 1000;

const MODES: PelletBoilerMode[] = ['heat-pump', 'pellet'];
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const PROFILE_KEY = /^(ecomax|mixer[1-5]):\d{1,3}$/;
const WEEK_DAYS = Object.values(WeekDay).filter((v): v is WeekDay => typeof v === 'number');
// CWU od–do: rozsądne granice (zakres regulatora sprawdza serwer przy zleceniu)
const CWU_MIN = 10;
const CWU_MAX = 80;

// Wartości startowe (kociol-ustawienia.md, punkt 4b; CWU z ustaleń 2026-10-04): pompa ciepła CWU
// 35–40 °C, pellet zadana 55 °C z histerezą 15 °C. Nastawy trybów bez CWU — CWU ustawia harmonogram.
export const DEFAULT_SCHEDULE_SETTINGS: Omit<PelletBoilerScheduleSettings, 'rootId'> = {
  enabled: false,
  defaults: { 'heat-pump': { cwuFrom: 35, cwuTo: 40, work: 'on' }, pellet: { cwuFrom: 40, cwuTo: 55, work: 'on' } },
  profiles: {
    'heat-pump': {
      'ecomax:99': 30, 'ecomax:98': 30, 'ecomax:17': 20, 'ecomax:101': 30, 'ecomax:105': 5, 'ecomax:122': 1,
      'mixer1:1': 30, 'mixer1:2': 50, 'mixer1:4': 0, 'mixer1:0': 35,
    },
    // histereza 12: start kotła przy 67 − 12 = 55 °C (decyzja użytkownika 2026-10-04)
    pellet: {
      'ecomax:99': 65, 'ecomax:98': 67, 'ecomax:17': 12, 'ecomax:101': 50, 'ecomax:105': 5, 'ecomax:122': 2,
      'mixer1:1': 40, 'mixer1:2': 50, 'mixer1:4': 1, 'mixer1:0': 40,
    },
  },
};

type ScheduleInput = Omit<PelletBoilerScheduleEntry, 'rootId'>;

const isInteger = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value);

const parseRange = (from: unknown, to: unknown): PelletBoilerCwuRange | string =>
  isInteger(from) && isInteger(to) && from >= CWU_MIN && to <= CWU_MAX && from < to
    ? { cwuFrom: from, cwuTo: to }
    : `CWU od–do: liczby całkowite ${CWU_MIN}–${CWU_MAX} °C, „od” mniejsze niż „do”.`;

// Wpis z body (POST/PUT) albo napis z błędem.
export function parseScheduleEntry(body: unknown): ScheduleInput | string {
  const input = (body ?? {}) as Record<string, unknown>;
  if (!MODES.includes(input.mode as PelletBoilerMode)) return 'mode: heat-pump albo pellet.';
  const type = input.type ?? 'cwu';
  if (type !== 'cwu' && type !== 'work') return 'type: cwu albo work.';
  if (type === 'work' && typeof input.on !== 'boolean') return 'on: true (włączony) albo false (wyłączony).';
  if (typeof input.startTime !== 'string' || !TIME.test(input.startTime)
    || typeof input.endTime !== 'string' || !TIME.test(input.endTime)) {
    return 'startTime i endTime w formacie HH:mm.';
  }
  const range = type === 'cwu' ? parseRange(input.cwuFrom, input.cwuTo) : {};
  if (typeof range === 'string') return range;
  let date: Date | undefined;
  if (input.date !== undefined && input.date !== null && input.date !== '') {
    date = new Date(String(input.date));
    if (Number.isNaN(date.getTime())) return 'Nieprawidłowa data.';
  }
  if (!date && !WEEK_DAYS.includes(input.dayOfWeek as WeekDay)) return 'Podaj dayOfWeek (-3…6) albo date.';
  return {
    type, mode: input.mode as PelletBoilerMode, enabled: input.enabled !== false,
    ...(type === 'work' ? { on: input.on as boolean } : {}),
    dayOfWeek: date ? undefined : input.dayOfWeek as WeekDay, date,
    startTime: input.startTime, endTime: input.endTime, ...range,
  };
}

// Ustawienia z body: enabled, defaults dla obu trybów, profiles (klucz → bajt 0–255).
export function parseScheduleSettings(body: unknown): Omit<PelletBoilerScheduleSettings, 'rootId'> | string {
  const input = (body ?? {}) as Record<string, unknown>;
  if (typeof input.enabled !== 'boolean') return 'enabled: true albo false.';
  const defaults = (input.defaults ?? {}) as Record<string, Record<string, unknown>>;
  const profiles = (input.profiles ?? {}) as Record<string, Record<string, unknown>>;
  const result = { enabled: input.enabled, defaults: {}, profiles: {} } as Omit<PelletBoilerScheduleSettings, 'rootId'>;
  for (const mode of MODES) {
    const range = parseRange(defaults[mode]?.cwuFrom, defaults[mode]?.cwuTo);
    if (typeof range === 'string') return range;
    const work = defaults[mode]?.work ?? 'on';
    if (work !== 'on' && work !== 'off') return `defaults.${mode}.work: on albo off.`;
    result.defaults[mode] = { ...range, work };
    const profile = profiles[mode] ?? {};
    if (typeof profile !== 'object' || Array.isArray(profile)) return 'profiles: obiekt klucz → wartość.';
    const clean: PelletBoilerProfile = {};
    for (const [key, value] of Object.entries(profile)) {
      if (!PROFILE_KEY.test(key) || !isInteger(value) || value < 0 || value > 255) return `profiles.${mode}.${key}: wartość 0–255.`;
      clean[key] = value;
    }
    result.profiles[mode] = clean;
  }
  return result;
}

// --- wyliczenie stanu ---

const shiftDate = (localDate: string, days: number) => {
  const date = new Date(`${localDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const warsawTime = (localDate: string, time: string) => fromZonedTime(`${localDate}T${time}:00`, TIME_ZONE);

// Okno wpisu zaczynające się danego dnia (przez północ: koniec następnego dnia).
function entryWindow(entry: PelletBoilerScheduleEntry, localDate: string) {
  if (!entry.enabled || entry.startTime === entry.endTime) return null;
  if (!scheduleDayMatches(entry, localDate)) return null;
  const endDate = entry.startTime < entry.endTime ? localDate : shiftDate(localDate, 1);
  return { start: warsawTime(localDate, entry.startTime), end: warsawTime(endDate, entry.endTime) };
}

// Działający wpis trybu danego rodzaju: z datą przed cyklicznym, przy pracy wyłączenie przed
// włączeniem, potem późniejszy start.
export function activeEntry(
  entries: PelletBoilerScheduleEntry[], mode: PelletBoilerMode, now: Date, type: 'cwu' | 'work' = 'cwu',
) {
  const today = formatInTimeZone(now, TIME_ZONE, 'yyyy-MM-dd');
  const matches = entries.filter((e) => e.mode === mode && (e.type ?? 'cwu') === type).flatMap((entry) =>
    [today, shiftDate(today, -1)].flatMap((day) => {
      const window = entryWindow(entry, day);
      return window && window.start <= now && now < window.end ? [{ entry, start: window.start }] : [];
    }));
  matches.sort((a, b) => Number(!!b.entry.date) - Number(!!a.entry.date)
    || Number(!!a.entry.on) - Number(!!b.entry.on)
    || b.start.getTime() - a.start.getTime());
  return matches[0]?.entry ?? null;
}

// Tryb z odczytu ustawień kotła: minimalna temperatura kotła (nr 99) < 50 °C = pompa ciepła.
export function boilerMode(settings: PelletBoilerSettingsEntry | null): PelletBoilerMode | null {
  const minimum = settings
    ? buildSettingsView(settings).groups.flatMap((g) => g.parameters).find((p) => p.index === 99)?.raw[0]
    : undefined;
  return minimum === undefined ? null : minimum < 50 ? 'heat-pump' : 'pellet';
}

export function scheduleState(
  settings: Omit<PelletBoilerScheduleSettings, 'rootId'>, entries: PelletBoilerScheduleEntry[], mode: PelletBoilerMode, now: Date,
) {
  const entry = activeEntry(entries, mode, now, 'cwu');
  const workEntry = activeEntry(entries, mode, now, 'work');
  const defaults = settings.defaults[mode];
  const state: PelletBoilerScheduleState = {
    mode,
    cwuFrom: entry?.cwuFrom ?? defaults.cwuFrom,
    cwuTo: entry?.cwuTo ?? defaults.cwuTo,
    work: workEntry ? (workEntry.on ? 'on' : 'off') : defaults.work ?? 'on',
  };
  return {
    state,
    scheduleId: entry?._id ? String(entry._id) : null,
    workScheduleId: workEntry?._id ? String(workEntry._id) : null,
  };
}

const sameState = (a?: PelletBoilerScheduleState, b?: PelletBoilerScheduleState) =>
  !!a && !!b && a.mode === b.mode && a.cwuFrom === b.cwuFrom && a.cwuTo === b.cwuTo && a.work === b.work
  && !!a.paused === !!b.paused;

// Kocioł już w danym stanie pracy (ostatni odczyt): wyłączony = stan 0 albo 7 (wygaszanie).
async function boilerIs(rootId: string, work: PelletBoilerWork) {
  const state = (await getPelletBoilerPelux200Last(rootId))?.state;
  if (state === undefined) return false;
  const off = state === 0 || state === 7;
  return work === 'off' ? off : !off;
}

const controlChange = (work: PelletBoilerWork): PelletBoilerCommandChange =>
  ({ kind: 'control', index: 0, value: work === 'on' ? 1 : 0 });

// Zmiany dla regulatora: tylko pola różne od ostatniego odczytu ustawień kotła.
function changesFor(state: PelletBoilerScheduleState, settings: PelletBoilerSettingsEntry): PelletBoilerCommandChange[] {
  const parameters = buildSettingsView(settings).groups.flatMap((g) => g.parameters);
  const current = (index: number) => parameters.find((p) => p.index === index)?.raw[0];
  const wanted: PelletBoilerCommandChange[] = [
    { kind: 'ecomax', index: 119, value: state.cwuTo },
    { kind: 'ecomax', index: 123, value: state.cwuTo - state.cwuFrom },
  ];
  return wanted.filter((change) => current(change.index) !== change.value);
}

// Jeden kocioł: stan harmonogramu i zlecenie zmian, gdy stan się zmienił. Błąd (np. brak odczytu
// ustawień, wartość poza zakresem regulatora) zostaje w lastError i przebieg powtarza się co minutę.
export async function applySchedule(rootId: string, now = new Date()) {
  const settings = await getScheduleSettings(rootId);
  const last = settings.lastApplied;
  try {
    // „Praca kotła: Wyłączony”: jedno zlecenie wyłączenia, harmonogram stoi. Tylko po przełączeniu
    // z „Włączony” (był zastosowany stan) — nowo dodany kocioł bez harmonogramu nie jest wyłączany.
    if (!settings.enabled) {
      if (!last || last.paused) return;
      const changes = (await boilerIs(rootId, 'off')) ? [] : [controlChange('off')];
      if (changes.length) await createCommands(rootId, { changes });
      const paused = { ...(last ?? { mode: 'pellet', cwuFrom: 0, cwuTo: 0 }), work: 'off', paused: true };
      await PelletBoilerScheduleSettingsModel.updateOne(
        { rootId }, { $set: { lastApplied: paused, lastAppliedAt: now }, $unset: { lastError: 1 } }, { upsert: true });
      sendMessage('update', rootId);
      return;
    }
    const boiler = await PelletBoilerSettingsModel.findOne({ rootId }).lean<PelletBoilerSettingsEntry>();
    const mode = boilerMode(boiler);
    if (!boiler || !mode) throw new Error('Brak odczytu ustawień kotła — nie wiadomo, który tryb działa.');
    const entries = await PelletBoilerScheduleModel.find({ rootId }).lean<PelletBoilerScheduleEntry[]>();
    const { state } = scheduleState(settings, entries, mode, now);
    if (sameState(state, last)) return;
    const changes = changesFor(state, boiler);
    const workChanged = !last || last.paused || last.work !== state.work;
    if (workChanged && !(await boilerIs(rootId, state.work))) changes.unshift(controlChange(state.work));
    if (changes.length) await createCommands(rootId, { changes });
    await PelletBoilerScheduleSettingsModel.updateOne(
      { rootId }, { $set: { lastApplied: state, lastAppliedAt: now }, $unset: { lastError: 1 } }, { upsert: true });
    console.log(`[pellet scheduler] ${rootId}`, state, `zleceń: ${changes.length}`);
  } catch (error) {
    await PelletBoilerScheduleSettingsModel.updateOne(
      { rootId }, { $set: { lastError: String((error as Error).message ?? error) } }, { upsert: true });
  }
  sendMessage('update', rootId);
}

export async function runPelletBoilerSchedulerOnce(now = new Date()) {
  const devices = await DeviceModel.find({ deviceType: DeviceType.PELLET_BOILER_PELUX200 }).select('_id').lean();
  for (const device of devices) await applySchedule(String(device._id), now);
}

export function startPelletBoilerScheduler(): NodeJS.Timeout {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runPelletBoilerSchedulerOnce();
    } catch (error) {
      console.error('[pellet scheduler] error:', error);
    } finally {
      running = false;
    }
  };
  void tick();
  return setInterval(() => void tick(), PELLET_SCHEDULER_INTERVAL_MS);
}

// --- dane dla aplikacji ---

// Zapisane ustawienia uzupełnione wartościami startowymi (brak dokumentu = harmonogram wyłączony).
export async function getScheduleSettings(rootId: string): Promise<PelletBoilerScheduleSettings> {
  const saved = await PelletBoilerScheduleSettingsModel.findOne({ rootId }).lean<Partial<PelletBoilerScheduleSettings>>();
  const base = DEFAULT_SCHEDULE_SETTINGS;
  return {
    rootId,
    enabled: saved?.enabled ?? base.enabled,
    defaults: {
      'heat-pump': { ...base.defaults['heat-pump'], ...(saved?.defaults?.['heat-pump']?.cwuTo ? saved.defaults['heat-pump'] : {}) },
      pellet: { ...base.defaults.pellet, ...(saved?.defaults?.pellet?.cwuTo ? saved.defaults.pellet : {}) },
    },
    profiles: {
      'heat-pump': saved?.profiles?.['heat-pump'] ?? base.profiles['heat-pump'],
      pellet: saved?.profiles?.pellet ?? base.profiles.pellet,
    },
    ...(saved?.lastApplied ? { lastApplied: saved.lastApplied } : {}),
    ...(saved?.lastError ? { lastError: saved.lastError } : {}),
  };
}

// Zapis ustawień harmonogramu; od razu przebieg dla tego kotła (zmiana domyślnych działa bez czekania).
export async function saveScheduleSettings(rootId: string, input: Omit<PelletBoilerScheduleSettings, 'rootId'>) {
  await PelletBoilerScheduleSettingsModel.updateOne(
    { rootId }, { $set: { enabled: input.enabled, defaults: input.defaults, profiles: input.profiles, rootId } }, { upsert: true });
  await applySchedule(rootId);
  return getScheduleSettings(rootId);
}

export async function getCurrentSchedule(rootId: string, now = new Date()) {
  const settings = await getScheduleSettings(rootId);
  const boiler = await PelletBoilerSettingsModel.findOne({ rootId }).lean<PelletBoilerSettingsEntry>();
  const mode = boilerMode(boiler);
  const entries = await PelletBoilerScheduleModel.find({ rootId }).lean<PelletBoilerScheduleEntry[]>();
  const current = mode ? scheduleState(settings, entries, mode, now) : { state: null, scheduleId: null, workScheduleId: null };
  return { enabled: settings.enabled, mode, ...current, lastError: settings.lastError ?? null };
}

export const listScheduleEntries = (rootId: string) =>
  PelletBoilerScheduleModel.find({ rootId }).sort({ mode: 1, type: 1, startTime: 1 }).lean<PelletBoilerScheduleEntry[]>();

export async function createScheduleEntry(rootId: string, entry: ScheduleInput) {
  const created = await PelletBoilerScheduleModel.create({ ...entry, rootId });
  await applySchedule(rootId);
  return created.toObject();
}

export async function replaceScheduleEntry(rootId: string, id: string, entry: ScheduleInput) {
  const updated = await PelletBoilerScheduleModel.findOneAndReplace({ _id: id, rootId }, { ...entry, rootId }, { new: true }).lean();
  if (updated) await applySchedule(rootId);
  return updated;
}

export async function removeScheduleEntry(rootId: string, id: string) {
  const result = await PelletBoilerScheduleModel.deleteOne({ _id: id, rootId });
  if (result.deletedCount > 0) await applySchedule(rootId);
  return result.deletedCount > 0;
}
