// Harmonogram kotła (zakładka Harmonogram pieca): CWU od–do w oknach godzin, osobna lista i osobne
// wartości poza harmonogramem dla trybu „Pompa ciepła” i „Pellet”; działa lista trybu, w którym kocioł
// jest teraz (z ostatniego odczytu ustawień: minimalna temperatura kotła nr 99 < 50 °C = pompa ciepła,
// jak w aplikacji). Serwer co minutę (startPelletBoilerScheduler, server.ts) wylicza stan dla każdego
// kotła z działającym harmonogramem i — tylko gdy stan zmienił się od ostatnio zastosowanego
// (lastApplied) — zleca zmianę parametrów tą samą drogą co aplikacja (createCommands): zadana CWU
// nr 119 = do, histereza nr 123 = do − od. Harmonogram działa po „Włącz regulator” i stoi po „Wyłącz
// regulator” w Ustawieniach (enabled); włączanie i wyłączanie regulatora robią same przyciski (zlecenie
// control), harmonogram regulatora nie przełącza (wpisy pracy kotła usunięte 2026-10-04, decyzja
// użytkownika; dawne wpisy type work są pomijane). Zmiana ręczna w aplikacji albo na panelu zostaje do
// następnej zmiany stanu (jak ręczne nadpisanie w pompie ciepła) — poza trybem pompy ciepła: tam CWU
// zmienione na panelu wraca co minutę do harmonogramu (pompa ciepła nie dogrzeje wyższej temperatury),
// a „CWU do” jest ograniczone do HEAT_PUMP_CWU_MAX (45 °C). Okno przez północ należy do dnia
// startu (jak harmonogram włącznika); data ma pierwszeństwo przed dniem tygodnia, potem późniejszy start.
// Od 2026-10-04 drugi rodzaj wpisu: sezon Lato / Zima (type season, parametr nr 125: 0 zima, 1 lato) w oknach
// godzin, z sezonem poza harmonogramem w defaults; wpis z progiem coldBelow działa tylko, gdy temperatura
// zewnętrzna z czujnika kotła (outside_temp z ostatniego odczytu) jest poniżej progu (z histerezą SEASON_COLD_HYSTERESIS: działający
// wpis zostaje do progu + 1 °C); bez temperatury taki wpis nie działa. Bez wpisu i bez sezonu w defaults
// harmonogram sezonem nie steruje. Zmiany sezonu i CWU idą do kotła jednym zleceniem (createCommands).
// Co minutę też ładowanie CWU (pellet-boiler-pelux200-cwu-loading.service.ts: pompa ciepła 47–49 °C).
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
  PelletBoilerScheduleSettings, PelletBoilerScheduleState, PelletBoilerSeason,
} from '../types';
import { createCommands } from './pellet-boiler-pelux200-command.service';
import { boilerMode, buildSettingsView } from './pellet-boiler-pelux200-settings.service';
import { getPelletBoilerPelux200Last } from './pellet-boiler-pelux200.service';
import { evaluateCwuLoading } from './pellet-boiler-pelux200-cwu-loading.service';
import { PelletBoilerCommandModel } from '../models/pellet-boiler-pelux200-command.model';

export { boilerMode };

export const PELLET_SCHEDULER_INTERVAL_MS = 60 * 1000;

const MODES: PelletBoilerMode[] = ['heat-pump', 'pellet'];
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const PROFILE_KEY = /^(ecomax|mixer[1-5]):\d{1,3}$/;
const WEEK_DAYS = Object.values(WeekDay).filter((v): v is WeekDay => typeof v === 'number');
// CWU od–do: rozsądne granice (zakres regulatora sprawdza serwer przy zleceniu)
const CWU_MIN = 10;
const CWU_MAX = 80;
// tryb pompy ciepła: CWU najwyżej 45 °C (wyżej pompa ciepła nie dogrzeje, nawet przy 47–49 °C w kotle)
export const HEAT_PUMP_CWU_MAX = 45;
// zmiana CWU z panelu wraca do harmonogramu dopiero, gdy od ostatniego zlecenia CWU minęło tyle czasu
const CWU_RESTORE_AFTER_MS = 5 * 60 * 1000;
// sezon: nr 125 (0 zima, 1 lato; kolejność z PyPlumIO, jak przełącznik Zima/Lato w Ustawieniach)
const SEASON_PARAMETER = 125;
const SEASON_VALUE: Record<PelletBoilerSeason, number> = { winter: 0, summer: 1 };
const SEASONS: PelletBoilerSeason[] = ['winter', 'summer'];
// próg temperatury wpisu sezonu [°C] i histereza: działający wpis zostaje do progu + histereza
const COLD_BELOW_MIN = -30;
const COLD_BELOW_MAX = 30;
export const SEASON_COLD_HYSTERESIS = 1;
// temperatura zewnętrzna z czujnika kotła (outside_temp) tylko z odczytu nie starszego niż (3 × domyślny interwał)
const OUTDOOR_MAX_AGE_MS = 15 * 60 * 1000;

// Temperatura zewnętrzna z ostatniego odczytu kotła (czujnik zewnętrzny regulatora; od 2026-10-04 zamiast
// IMGW Zakopane, decyzja użytkownika); null bez odczytu, bez czujnika albo gdy odczyt jest starszy niż 15 min.
export async function boilerOutdoorTemperature(rootId: string, now = new Date()): Promise<number | null> {
  const last = await getPelletBoilerPelux200Last(rootId);
  const at = (last as { createdAt?: Date } | undefined)?.createdAt;
  if (typeof last?.outside_temp !== 'number' || !at || now.getTime() - new Date(at).getTime() > OUTDOOR_MAX_AGE_MS) return null;
  return last.outside_temp;
}

// Wartości startowe (kociol-ustawienia.md, punkt 4b; CWU z ustaleń 2026-10-04): pompa ciepła CWU
// 35–40 °C, pellet zadana 55 °C z histerezą 15 °C. Nastawy trybów bez CWU — CWU ustawia harmonogram.
export const DEFAULT_SCHEDULE_SETTINGS: Omit<PelletBoilerScheduleSettings, 'rootId'> = {
  enabled: false,
  defaults: { 'heat-pump': { cwuFrom: 35, cwuTo: 40 }, pellet: { cwuFrom: 40, cwuTo: 55 } },
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

const parseRange = (from: unknown, to: unknown, mode?: PelletBoilerMode): PelletBoilerCwuRange | string => {
  const max = mode === 'heat-pump' ? HEAT_PUMP_CWU_MAX : CWU_MAX;
  return isInteger(from) && isInteger(to) && from >= CWU_MIN && to <= max && from < to
    ? { cwuFrom: from, cwuTo: to }
    : `CWU od–do: liczby całkowite ${CWU_MIN}–${max} °C${mode === 'heat-pump' ? ' (tryb pompy ciepła)' : ''}, „od” mniejsze niż „do”.`;
};

// Wpis z body (POST/PUT) albo napis z błędem.
export function parseScheduleEntry(body: unknown): ScheduleInput | string {
  const input = (body ?? {}) as Record<string, unknown>;
  if (!MODES.includes(input.mode as PelletBoilerMode)) return 'mode: heat-pump albo pellet.';
  const type = input.type ?? 'cwu';
  if (type !== 'cwu' && type !== 'season') return 'type: cwu albo season (włączanie i wyłączanie kotła z harmonogramu usunięto).';
  if (typeof input.startTime !== 'string' || !TIME.test(input.startTime)
    || typeof input.endTime !== 'string' || !TIME.test(input.endTime)) {
    return 'startTime i endTime w formacie HH:mm.';
  }
  let what: Partial<ScheduleInput>;
  if (type === 'season') {
    if (!SEASONS.includes(input.season as PelletBoilerSeason)) return 'season: winter albo summer.';
    const cold = input.coldBelow;
    if (cold !== undefined && cold !== null && (!isInteger(cold) || cold < COLD_BELOW_MIN || cold > COLD_BELOW_MAX)) {
      return `coldBelow: liczba całkowita ${COLD_BELOW_MIN}–${COLD_BELOW_MAX} °C albo brak.`;
    }
    what = { season: input.season as PelletBoilerSeason, coldBelow: isInteger(cold) ? cold : null };
  } else {
    const range = parseRange(input.cwuFrom, input.cwuTo, input.mode as PelletBoilerMode);
    if (typeof range === 'string') return range;
    what = range;
  }
  let date: Date | undefined;
  if (input.date !== undefined && input.date !== null && input.date !== '') {
    date = new Date(String(input.date));
    if (Number.isNaN(date.getTime())) return 'Nieprawidłowa data.';
  }
  if (!date && !WEEK_DAYS.includes(input.dayOfWeek as WeekDay)) return 'Podaj dayOfWeek (-3…6) albo date.';
  return {
    type, mode: input.mode as PelletBoilerMode, enabled: input.enabled !== false,
    dayOfWeek: date ? undefined : input.dayOfWeek as WeekDay, date,
    startTime: input.startTime, endTime: input.endTime, ...what,
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
    const range = parseRange(defaults[mode]?.cwuFrom, defaults[mode]?.cwuTo, mode);
    if (typeof range === 'string') return range;
    const season = defaults[mode]?.season;
    if (season !== undefined && season !== null && !SEASONS.includes(season as PelletBoilerSeason)) {
      return 'Sezon poza harmonogramem: winter albo summer.';
    }
    result.defaults[mode] = { ...range, ...(season ? { season: season as PelletBoilerSeason } : {}) };
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

// Działający wpis danego rodzaju (cwu albo season) trybu: z datą przed cyklicznym, potem późniejszy start
// (dawne wpisy pracy kotła pomijane). eligible odrzuca wpisy, które teraz nie mogą działać (próg temperatury).
export function activeEntry(
  entries: PelletBoilerScheduleEntry[], mode: PelletBoilerMode, now: Date,
  type: 'cwu' | 'season' = 'cwu', eligible: (entry: PelletBoilerScheduleEntry) => boolean = () => true,
) {
  const today = formatInTimeZone(now, TIME_ZONE, 'yyyy-MM-dd');
  const matches = entries.filter((e) => e.mode === mode && (e.type ?? 'cwu') === type && eligible(e)).flatMap((entry) =>
    [today, shiftDate(today, -1)].flatMap((day) => {
      const window = entryWindow(entry, day);
      return window && window.start <= now && now < window.end ? [{ entry, start: window.start }] : [];
    }));
  matches.sort((a, b) => Number(!!b.entry.date) - Number(!!a.entry.date) || b.start.getTime() - a.start.getTime());
  return matches[0]?.entry ?? null;
}

// Wpis sezonu z progiem działa, gdy temperatura zewnętrzna jest poniżej progu; wpis, który już działał
// (lastSeasonScheduleId), zostaje do progu + SEASON_COLD_HYSTERESIS. Bez temperatury wpis z progiem nie działa.
const coldEnough = (entry: PelletBoilerScheduleEntry, outdoor: number | null, lastSeasonScheduleId?: string | null) => {
  if (entry.coldBelow === undefined || entry.coldBelow === null) return true;
  if (outdoor === null) return false;
  const wasActive = !!lastSeasonScheduleId && String(entry._id) === lastSeasonScheduleId;
  return outdoor < entry.coldBelow + (wasActive ? SEASON_COLD_HYSTERESIS : 0);
};

export function scheduleState(
  settings: Omit<PelletBoilerScheduleSettings, 'rootId'>, entries: PelletBoilerScheduleEntry[], mode: PelletBoilerMode, now: Date,
  outdoor: number | null = null, lastSeasonScheduleId?: string | null,
) {
  const entry = activeEntry(entries, mode, now);
  const seasonEntry = activeEntry(entries, mode, now, 'season', (e) => coldEnough(e, outdoor, lastSeasonScheduleId));
  const defaults = settings.defaults[mode];
  const season = seasonEntry?.season ?? defaults.season;
  const seasonScheduleId = seasonEntry?._id ? String(seasonEntry._id) : null;
  const state: PelletBoilerScheduleState = {
    mode,
    cwuFrom: entry?.cwuFrom ?? defaults.cwuFrom,
    cwuTo: entry?.cwuTo ?? defaults.cwuTo,
    ...(season ? { season } : {}),
    seasonScheduleId,
  };
  return { state, scheduleId: entry?._id ? String(entry._id) : null, seasonScheduleId };
}

const sameState = (a?: PelletBoilerScheduleState, b?: PelletBoilerScheduleState) =>
  !!a && !!b && a.mode === b.mode && a.cwuFrom === b.cwuFrom && a.cwuTo === b.cwuTo && a.season === b.season
  && !!a.paused === !!b.paused;

// Zmiany dla regulatora (sezon i CWU w jednym zleceniu): tylko pola różne od ostatniego odczytu ustawień kotła.
function changesFor(state: PelletBoilerScheduleState, settings: PelletBoilerSettingsEntry): PelletBoilerCommandChange[] {
  const parameters = buildSettingsView(settings).groups.flatMap((g) => g.parameters);
  const current = (index: number) => parameters.find((p) => p.index === index)?.raw[0];
  const wanted: PelletBoilerCommandChange[] = [
    ...(state.season ? [{ kind: 'ecomax' as const, index: SEASON_PARAMETER, value: SEASON_VALUE[state.season] }] : []),
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
    // harmonogram nie działa („Wyłącz regulator”): nic nie zleca; zapamiętuje przerwę, żeby po wznowieniu
    // zastosować stan od razu
    if (!settings.enabled) {
      if (!last || last.paused) return;
      const paused = { ...last, paused: true };
      await PelletBoilerScheduleSettingsModel.updateOne(
        { rootId }, { $set: { lastApplied: paused, lastAppliedAt: now }, $unset: { lastError: 1 } }, { upsert: true });
      sendMessage('update', rootId);
      return;
    }
    const boiler = await PelletBoilerSettingsModel.findOne({ rootId }).lean<PelletBoilerSettingsEntry>();
    const mode = boilerMode(boiler);
    if (!boiler || !mode) throw new Error('Brak odczytu ustawień kotła — nie wiadomo, który tryb działa.');
    const entries = await PelletBoilerScheduleModel.find({ rootId }).lean<PelletBoilerScheduleEntry[]>();
    const { state } = scheduleState(settings, entries, mode, now, await boilerOutdoorTemperature(rootId, now), last?.seasonScheduleId);
    if (sameState(state, last)) {
      // ten sam sezon z innego wpisu (np. kolejne okno): zapamiętuje wpis dla histerezy progu
      if (last && (last.seasonScheduleId ?? null) !== state.seasonScheduleId) {
        await PelletBoilerScheduleSettingsModel.updateOne({ rootId }, { $set: { 'lastApplied.seasonScheduleId': state.seasonScheduleId } });
      }
      if (mode === 'heat-pump') await restoreCwu(rootId, state, boiler, now);
      return;
    }
    const changes = changesFor(state, boiler);
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

// Tryb pompy ciepła: CWU zmienione na panelu wraca do harmonogramu. Zadaną kocioł podaje w każdym odczycie
// (water_heater_target), histerezę tylko w odczycie ustawień. Nie częściej niż co CWU_RESTORE_AFTER_MS
// od ostatniego zlecenia CWU (odczyt tuż po zapisie może jeszcze mieć starą wartość).
async function restoreCwu(rootId: string, state: PelletBoilerScheduleState, boiler: PelletBoilerSettingsEntry, now: Date) {
  // zlecenie CWU w toku albo świeże: najpierw jego wynik i nowy odczyt
  const recent = await PelletBoilerCommandModel.exists({
    rootId, kind: 'ecomax', index: { $in: [119, 123] },
    $or: [{ status: { $in: ['pending', 'sent'] } }, { createdAt: { $gt: new Date(now.getTime() - CWU_RESTORE_AFTER_MS) } }],
  });
  if (recent) return;
  const target = (await getPelletBoilerPelux200Last(rootId))?.water_heater_target;
  // tylko CWU: sezon zmieniony ręcznie zostaje do następnej zmiany stanu harmonogramu
  const changes = changesFor(state, boiler).filter((change) => change.index !== SEASON_PARAMETER);
  if (target !== undefined && target !== state.cwuTo && !changes.some((c) => c.index === 119)) {
    changes.unshift({ kind: 'ecomax', index: 119, value: state.cwuTo });
  }
  if (!changes.length) return;
  await createCommands(rootId, { changes });
  console.log(`[pellet scheduler] ${rootId} CWU zmienione poza harmonogramem — przywracam`, changes);
}

export async function runPelletBoilerSchedulerOnce(now = new Date()) {
  const devices = await DeviceModel.find({ deviceType: DeviceType.PELLET_BOILER_PELUX200 }).select('_id').lean();
  for (const device of devices) {
    await applySchedule(String(device._id), now);
    await evaluateCwuLoading(String(device._id), now).catch((error) => console.error('[pellet cwu] error:', error));
  }
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
  const outdoor = await boilerOutdoorTemperature(rootId, now);
  const current = mode
    ? scheduleState(settings, entries, mode, now, outdoor, settings.lastApplied?.seasonScheduleId)
    : { state: null, scheduleId: null, seasonScheduleId: null };
  // outdoorTemperature: temperatura zewnętrzna z czujnika kotła (ostatni odczyt) dla zakładki Harmonogram
  return { enabled: settings.enabled, mode, ...current, outdoorTemperature: outdoor, lastError: settings.lastError ?? null };
}

// dawne wpisy pracy kotła (type work) nie są pokazywane
export const listScheduleEntries = (rootId: string) =>
  PelletBoilerScheduleModel.find({ rootId, type: { $ne: 'work' } }).sort({ mode: 1, type: 1, startTime: 1 }).lean<PelletBoilerScheduleEntry[]>();

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
