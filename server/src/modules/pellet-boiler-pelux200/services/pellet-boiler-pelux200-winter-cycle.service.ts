// Cykl Zimy w trybie „Pompa ciepła” (zasada użytkownika z 2026-10-05). Kocioł jest wtedy rozdzielaczem ciepła
// z pompy ciepła, a po przełączeniu na Zimę pompa CO szybko wychładza wodę (poniżej 30 °C). Gdy kocioł ma być
// na Zimie (harmonogram sezonu, „Poza harmonogramem: Zima” albo przycisk „Zima” w Ustawieniach), sezonem
// steruje ten cykl, na temperaturze KOTŁA (heating_temp z ostatniego odczytu):
//   1. Lato, kocioł poniżej progu Zimy: pompa ciepła dostaje wymuszenie startu sprężarki (jak „Wymuszenie
//      pracy”), najwyżej co FORCE_REPEAT_MS; kocioł ≥ progu: zlecenie Zima (nr 125 = 0). Czekanie do skutku.
//      Próg Zimy (2026-10-11) = temperatura, do której grzeje pompa ciepła (HP.Tmax ze świeżej telemetrii),
//      minus WINTER_BELOW_PUMP_MAX (3 °C), w granicach WINTER_FROM_MIN–WINTER_FROM_MAX; bez świeżej telemetrii
//      WINTER_FROM (45 °C). Próg sprawdzany na kotle ALBO na HP.Ttarget pompy (czujnik, na którym pompa staje
//      po osiągnięciu Tmax; telemetria co 10–30 s, kocioł co 60 s): bez tego pompa mogła stanąć przed odczytem
//      kotła z progiem, a wymuszenie startu CHPC przyjmuje tylko poniżej Tmax − 3 °C, więc Zima by nie przyszła.
//   2. Zima: pompa CO pracuje, woda stygnie.
//   3. Kocioł < SUMMER_BELOW (30 °C) i pompa CO kotła stoi: zlecenie Lato (nr 125 = 1), dalej punkt 1.
// Mieszacz 1 (2026-10-11): razem z Latem zadana mieszacza 1 (nr 0) spada do minimum regulatora (dolna granica
// zadanej = nr 1), żeby po przejściu na Zimę mieszacz nie wychłodził od razu wody z pompy. Poprzednia zadana
// wraca na Zimie, gdy woda w pompie (HP.Ttarget) po spadku poniżej minimalnej zadanej pompy (HP.Tmin; bez niej
// MIXER_RESTORE_FROM 40 °C) wróci do niej LUB utrzyma wartość przez MIXER_RESTORE_MS (15 min) LUB wzrośnie o MIXER_RESTORE_RISE
// (5 °C) (decyzja 2026-10-11: każdy warunek osobno), i od razu przy wyjściu z cyklu (stopWinterCycle). Ręczna zmiana zadanej wygrywa: gdy odczyt ustawień po
// ostatnim zleceniu zadanej ma inną wartość niż obniżona, serwer nic nie przywraca. Stan w polu winterMixer
// (osobno od winterCycle, który znika przy wyjściu z cyklu, a przywrócenie może czekać na kocioł).
// Sezon kotła (Lato / Zima) bierze się z ostatniego odczytu ustawień (nr 125); zmiana z panelu jest więc
// przejmowana dopiero w kroku cyklu (Zima zostaje, dopóki pompa CO pracuje). Zlecenie sezonu w toku (pending,
// sent) wstrzymuje cykl do wyniku i nowego odczytu ustawień. Bez świeżego odczytu kotła cykl czeka.
// Moduły nie importują siebie nawzajem: stan i wymuszenie pompy ciepła idą przez API serwera (GET /hp,
// POST /operation/set), jak ładowanie CWU (pellet-boiler-pelux200-cwu-loading.service.ts).
import { internalHeaders } from '../../../core/internal';
import { fromZonedTime } from 'date-fns-tz';
import { TIME_ZONE } from '../../../core/time';
import { PelletBoilerSettingsEntry, PelletBoilerSettingsModel } from '../models/pellet-boiler-pelux200-settings.model';
import { PelletBoilerCommandModel } from '../models/pellet-boiler-pelux200-command.model';
import { PelletBoilerScheduleSettingsModel } from '../models/pellet-boiler-pelux200-schedule.model';
import { PelletBoilerSeason, PelletBoilerWinterCycle, PelletBoilerWinterMixer } from '../types';
import { createCommands } from './pellet-boiler-pelux200-command.service';
import { operationHeaders, systemMeta } from '../../../core/services/operation-log.service';
import { OperationMeta } from '../../../core/types';
import { decodeMixerParameters } from './pellet-boiler-pelux200-settings.service';
import { getPelletBoilerPelux200Last } from './pellet-boiler-pelux200.service';
import { effectiveBoilerMode, linkedHeatPumpRootId } from './pellet-boiler-pelux200-heat-pump-link.service';
import { getPelletCwu, pelletCwuBlocksPump } from './pellet-boiler-pelux200-pellet-cwu.service';

export const WINTER_FROM = 45;
// temperatura do opisu w dzienniku operacji
const tempText = (value: number | null | undefined) =>
  typeof value === 'number' ? `${value.toLocaleString('pl-PL', { maximumFractionDigits: 1 })} °C` : 'brak odczytu';
export const WINTER_BELOW_PUMP_MAX = 3;
export const SUMMER_BELOW = 30;
// powyżej progu Lata; poniżej maks. temperatury pompy ciepła (50 °C; od 52 °C pompa jest blokowana: kocioł gorący)
const WINTER_FROM_MIN = SUMMER_BELOW + 1;
const WINTER_FROM_MAX = 49;
// bez HP.Tmin w telemetrii pompy
export const MIXER_RESTORE_FROM = 40;
export const MIXER_RESTORE_MS = 15 * 60 * 1000;
export const MIXER_RESTORE_RISE = 5;
// spadek wody w pompie mniejszy niż to = „trzyma wartość” (szum czujnika)
const MIXER_HOLD_TOLERANCE = 0.5;
const SEASON_PARAMETER = 125;
const SEASON_VALUE: Record<PelletBoilerSeason, number> = { winter: 0, summer: 1 };
// wymuszenie startu sprężarki nie częściej niż co tyle (start trwa, co odpowiada co 10–30 s)
export const FORCE_REPEAT_MS = 10 * 60 * 1000;
// odczyt kotła co 60 s (poll_interval_seconds); starszy niż to = brak danych, cykl czeka
const READING_MAX_AGE_MS = 15 * 60 * 1000;

export type PumpTemperatures = { max: number | null; min?: number | null; water: number | null };

export type HeatPumpControl = {
  /** sprężarka pracuje (HP.HPS z ostatniej telemetrii); null = nie wiadomo */
  running: (heatPumpRootId: string) => Promise<boolean | null>;
  /** conditions: warunki do dziennika operacji pompy (nagłówki x-operation-*) */
  force: (heatPumpRootId: string, conditions?: string) => Promise<void>;
  /** ze świeżej telemetrii [°C]: max = HP.Tmax (do tylu grzeje pompa), min = HP.Tmin (minimalna zadana),
   *  water = HP.Ttarget (czujnik, na którym staje); null / brak = nie wiadomo */
  temperatures?: (heatPumpRootId: string) => Promise<PumpTemperatures | null>;
};

// telemetria pompy co 10–30 s; starsza = pompa offline
const PUMP_DATA_MAX_AGE_MS = 5 * 60 * 1000;

// czas telemetrii: createdAt z bazy albo pole time sterownika ("YYYY.MM.DD HH:MM:SS", czas polski)
const telemetryTime = (data: { createdAt?: string; time?: string }): Date | null => {
  if (data.createdAt) return new Date(data.createdAt);
  const match = /^(\d{4})\.(\d{2})\.(\d{2}) (\d{2}:\d{2}:\d{2})$/.exec(data.time ?? '');
  return match ? fromZonedTime(`${match[1]}-${match[2]}-${match[3]}T${match[4]}`, TIME_ZONE) : null;
};

const internalApiUrl = () => process.env.INTERNAL_API_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3001}/api`;

// ostatnia telemetria pompy, tylko świeża (pompa offline = null)
async function freshPumpData(heatPumpRootId: string) {
  // wywołanie wewnętrzne: bez logowania (core/internal.ts)
  const response = await fetch(`${internalApiUrl()}/hp?rootId=${encodeURIComponent(heatPumpRootId)}`, { headers: internalHeaders() });
  if (!response.ok) return null;
  const data = await response.json() as {
    HP?: { HPS?: unknown; Tmax?: unknown; Tmin?: unknown; Ttarget?: unknown }; createdAt?: string; time?: string;
  };
  const at = telemetryTime(data);
  return data.HP && at && Date.now() - at.getTime() <= PUMP_DATA_MAX_AGE_MS ? data.HP : null;
}

// Do jakiej temperatury pompa ciepła grzeje CWU (ostrzeżenie o za wysokiej zadanej CWU w kotle): ze świeżej telemetrii
// włączonej pompy (work_mode ≠ OFF) temp_max (co od 1.2.0: jedna nastawa dla CO i CWU), u starszego co cwu_max,
// bez nich HP.Tmax. null: pompa wyłączona, offline albo bez tych pól.
export async function heatPumpCwuMax(heatPumpRootId: string): Promise<number | null> {
  const response = await fetch(`${internalApiUrl()}/hp?rootId=${encodeURIComponent(heatPumpRootId)}`);
  if (!response.ok) return null;
  const data = await response.json() as {
    work_mode?: unknown; temp_max?: unknown; cwu_max?: unknown; HP?: { Tmax?: unknown }; createdAt?: string; time?: string;
  };
  const at = telemetryTime(data);
  if (!at || Date.now() - at.getTime() > PUMP_DATA_MAX_AGE_MS || !data.work_mode || data.work_mode === 'OFF') return null;
  const value = [data.temp_max, data.cwu_max, data.HP?.Tmax].map(Number).find((n) => Number.isFinite(n) && n > 0);
  return value ?? null;
}

export const heatPumpControl: HeatPumpControl = {
  running: async (heatPumpRootId) => {
    const hp = await freshPumpData(heatPumpRootId);
    if (hp?.HPS === undefined) return null;
    return Number(hp.HPS) > 0 || hp.HPS === true;
  },
  temperatures: async (heatPumpRootId) => {
    const hp = await freshPumpData(heatPumpRootId);
    if (!hp) return null;
    const number = (value: unknown) => (value === undefined || value === null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value));
    const positive = (value: unknown) => { const n = number(value); return n !== null && n > 0 ? n : null; };
    return { max: positive(hp.Tmax), min: positive(hp.Tmin), water: number(hp.Ttarget) };
  },
  force: async (heatPumpRootId, conditions) => {
    const response = await fetch(`${internalApiUrl()}/operation/set?rootId=${encodeURIComponent(heatPumpRootId)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...internalHeaders(),
        ...operationHeaders(systemMeta('Kocioł: cykl Zimy', 'Kocioł czeka na Zimę — wymuszenie startu sprężarki, żeby pompa nagrzała kocioł.', conditions)),
      },
      body: JSON.stringify({ force: '1' }),
    });
    if (!response.ok) throw new Error(`pompa ciepła: HTTP ${response.status}`);
  },
};

const saveCycle = (rootId: string, cycle: PelletBoilerWinterCycle | null) =>
  PelletBoilerScheduleSettingsModel.updateOne({ rootId }, { $set: { winterCycle: cycle } }, { upsert: true });

const saveMixer = (rootId: string, mixer: PelletBoilerWinterMixer | null) =>
  PelletBoilerScheduleSettingsModel.updateOne({ rootId }, { $set: { winterMixer: mixer } }, { upsert: true });

const loadMixer = async (rootId: string) =>
  (await PelletBoilerScheduleSettingsModel.findOne({ rootId }).select('winterMixer')
    .lean<{ winterMixer?: PelletBoilerWinterMixer | null }>())?.winterMixer ?? null;

// Zadana mieszacza 1 z ostatniego odczytu ustawień: wartość, dolna granica i czy odczyt jest po ostatnim zleceniu
// zadanej (settled; zlecenie w toku albo odczyt sprzed jego wyniku = nie wiadomo, co jest w regulatorze).
async function mixerTarget(rootId: string) {
  const settings = await PelletBoilerSettingsModel.findOne({ rootId }).lean<PelletBoilerSettingsEntry>();
  const target = settings?.mixer_parameters
    ? decodeMixerParameters(settings.mixer_parameters).find((m) => m.mixer === 1)?.parameters.find((p) => p.index === 0)
    : undefined;
  if (!settings || !target || target.unknown) return null;
  const command = await PelletBoilerCommandModel.findOne({ rootId, kind: 'mixer', mixer: 1, index: 0 }).sort({ createdAt: -1 })
    .lean<{ status: string; doneAt?: Date }>();
  const settled = !command || (!['pending', 'sent'].includes(command.status)
    && (!command.doneAt || new Date(settings.readAt).getTime() > new Date(command.doneAt).getTime()));
  return { value: target.raw[0], min: target.raw[1], settled };
}

// Przywrócenie zadanej mieszacza 1; true = stan winterMixer do skasowania (przywrócona albo zmieniona ręcznie).
async function restoreMixer(rootId: string, mixer: PelletBoilerWinterMixer, meta: OperationMeta): Promise<boolean> {
  const current = await mixerTarget(rootId);
  if (!current) return true;
  if (!current.settled) return false;
  if (current.value === mixer.lowered) {
    await createCommands(rootId, { changes: [{ kind: 'mixer', mixer: 1, index: 0, value: mixer.saved }] }, meta);
    console.log(`[pellet zima] ${rootId} mieszacz 1: zadana wraca ${mixer.lowered} → ${mixer.saved} °C`);
  }
  return true;
}

// Cykl nie działa (kocioł ma być na Lecie albo tryb Pellet): bez stanu; obniżona zadana mieszacza 1 wraca.
export async function stopWinterCycle(rootId: string) {
  await PelletBoilerScheduleSettingsModel.updateOne({ rootId, winterCycle: { $ne: null } }, { $set: { winterCycle: null } });
  const mixer = await loadMixer(rootId);
  if (mixer && await restoreMixer(rootId, mixer, systemMeta('Cykl Zimy', 'Koniec cyklu Zimy (tryb Pellet albo Lato z harmonogramu): zadana mieszacza 1 wraca od razu.'))) {
    await saveMixer(rootId, null);
  }
}

// Jeden krok cyklu (scheduler kotła co minutę). boilerSeason: sezon z ostatniego odczytu ustawień kotła.
export async function runWinterCycle(
  rootId: string,
  boilerSeason: PelletBoilerSeason | undefined,
  now = new Date(),
  pump: HeatPumpControl = heatPumpControl,
): Promise<PelletBoilerWinterCycle> {
  const saved = (await PelletBoilerScheduleSettingsModel.findOne({ rootId }).select('winterCycle')
    .lean<{ winterCycle?: PelletBoilerWinterCycle | null }>())?.winterCycle ?? null;
  const last = await getPelletBoilerPelux200Last(rootId) as { heating_temp?: number; heating_pump?: boolean; createdAt?: Date } | null;
  const fresh = !!last?.createdAt && now.getTime() - new Date(last.createdAt).getTime() < READING_MAX_AGE_MS;
  const temperature = fresh && typeof last?.heating_temp === 'number' ? last.heating_temp : null;
  const phase = boilerSeason === 'winter' ? 'winter' : 'waiting';
  const cycle: PelletBoilerWinterCycle = {
    phase,
    since: saved?.phase === phase && saved.since ? new Date(saved.since) : now,
    temperature,
    forcedAt: saved?.forcedAt ? new Date(saved.forcedAt) : null,
  };

  if (phase === 'waiting') {
    const pumpTemperatures = await linkedPumpTemperatures(rootId, pump);
    cycle.winterFrom = winterFromMax(pumpTemperatures?.max ?? null);
    cycle.pumpTemperature = pumpTemperatures?.water ?? null;
  }
  let mixer = await loadMixer(rootId);
  // ręczna zmiana zadanej mieszacza 1 (odczyt po ostatnim zleceniu z inną wartością niż obniżona) wygrywa
  if (mixer) {
    const current = await mixerTarget(rootId);
    if (!current || (current.settled && current.value !== mixer.lowered)) {
      await saveMixer(rootId, null);
      mixer = null;
    }
  }
  // zlecenie sezonu w toku: najpierw jego wynik i nowy odczyt ustawień
  const pending = await PelletBoilerCommandModel.exists({ rootId, kind: 'ecomax', index: SEASON_PARAMETER, status: { $in: ['pending', 'sent'] } });
  if (!pending && phase === 'waiting') {
    const from = cycle.winterFrom ?? WINTER_FROM;
    const reached = [temperature, cycle.pumpTemperature ?? null].some((t) => t !== null && t >= from);
    if (reached) {
      await createCommands(rootId, { changes: [{ kind: 'ecomax', index: SEASON_PARAMETER, value: SEASON_VALUE.winter }] }, systemMeta(
        'Cykl Zimy', 'Kocioł nagrzany przez pompę ciepła — Zima rozprowadza ciepło po CO.',
        `kocioł ${tempText(temperature)}, woda w pompie ${tempText(cycle.pumpTemperature ?? null)}; próg ${tempText(from)}`
          + `${cycle.winterFrom !== WINTER_FROM ? ' (Tmax pompy − 3 °C)' : ''}`,
      ));
      console.log(`[pellet zima] ${rootId} kocioł ${temperature} °C, pompa ${cycle.pumpTemperature} °C, próg ${from} — Zima`);
    } else if (temperature !== null || cycle.pumpTemperature != null) {
      await forcePumpIfDue(rootId, cycle, now, pump);
    }
  } else if (!pending && temperature !== null && temperature < SUMMER_BELOW && last?.heating_pump === false) {
    // razem z Latem zadana mieszacza 1 na minimum (opis na górze), jeśli nie jest już obniżona
    const current = mixer ? null : await mixerTarget(rootId);
    const lower = current && current.settled && current.value > current.min ? current : null;
    await createCommands(rootId, { changes: [
      { kind: 'ecomax', index: SEASON_PARAMETER, value: SEASON_VALUE.summer },
      ...(lower ? [{ kind: 'mixer', mixer: 1, index: 0, value: lower.min }] : []),
    ] }, systemMeta(
      'Cykl Zimy',
      'Woda w kotle wychłodzona — Lato do ponownego nagrzania przez pompę ciepła'
        + (lower ? '; mieszacz 1 na minimum, żeby po Zimie nie wychłodził wody z pompy.' : '.'),
      `kocioł ${tempText(temperature)} < ${SUMMER_BELOW} °C, pompa CO stoi`,
    ));
    if (lower) {
      mixer = { saved: lower.value, lowered: lower.min, loweredAt: now, reference: null, referenceAt: null };
      await saveMixer(rootId, mixer);
    }
    const mixerNote = lower ? `, mieszacz 1 ${lower.value} → ${lower.min} °C` : '';
    console.log(`[pellet zima] ${rootId} kocioł ${temperature} °C < ${SUMMER_BELOW}, pompa CO stoi — Lato${mixerNote}, czekam na ciepły kocioł`);
  } else if (mixer && phase === 'winter') {
    // Zima: zadana mieszacza 1 wraca, gdy woda w pompie (opis na górze): ≥ minimalnej zadanej pompy LUB trzyma
    // wartość odniesienia przez MIXER_RESTORE_MS LUB wzrosła od niej o MIXER_RESTORE_RISE. Spadek o więcej niż
    // MIXER_HOLD_TOLERANCE ustawia nowe odniesienie (od niego liczy się czas i wzrost).
    const temperatures = await linkedPumpTemperatures(rootId, pump);
    const water = temperatures?.water ?? null;
    const from = temperatures?.min ?? MIXER_RESTORE_FROM;
    cycle.pumpTemperature = water;
    mixer.restoreFrom = from;
    if (water !== null) {
      if (mixer.reference == null || !mixer.referenceAt || water < mixer.reference - MIXER_HOLD_TOLERANCE) {
        mixer.reference = water;
        mixer.referenceAt = now;
      }
      // na początku Zimy woda ma ok. Tmax − 3 (> Tmin): warunek Tmin liczy się dopiero po spadku poniżej niej
      if (water < from) mixer.belowMin = true;
      const held = now.getTime() - new Date(mixer.referenceAt).getTime() >= MIXER_RESTORE_MS;
      const backToMin = !!mixer.belowMin && water >= from;
      if ((backToMin || water >= mixer.reference + MIXER_RESTORE_RISE || held) && await restoreMixer(rootId, mixer, systemMeta(
      'Cykl Zimy', 'Ciepło z pompy wróciło — zadana mieszacza 1 wraca do wartości sprzed obniżenia.',
      backToMin ? `woda w pompie ${tempText(water)} wróciła do minimalnej zadanej pompy ${tempText(from)}`
        : water >= mixer.reference + MIXER_RESTORE_RISE ? `woda w pompie ${tempText(water)} wzrosła o ${MIXER_RESTORE_RISE} °C od ${tempText(mixer.reference)}`
        : `woda w pompie ${tempText(water)} trzyma się od 15 min`,
    ))) {
        console.log(`[pellet zima] ${rootId} pompa ${water} °C (min ${from}, odniesienie ${mixer.reference} °C) — mieszacz 1 wraca`);
        mixer = null;
      }
    }
    await saveMixer(rootId, mixer);
  }
  if (mixer) cycle.mixer = mixer;
  await saveCycle(rootId, cycle);
  return cycle;
}

// Próg Zimy: temperatura, do której grzeje powiązana pompa ciepła, minus WINTER_BELOW_PUMP_MAX (opis na górze).
export const winterFromMax = (max: number | null) =>
  max === null ? WINTER_FROM : Math.min(WINTER_FROM_MAX, Math.max(WINTER_FROM_MIN, max - WINTER_BELOW_PUMP_MAX));

async function linkedPumpTemperatures(rootId: string, pump: HeatPumpControl) {
  const heatPump = await linkedHeatPumpRootId(rootId);
  return heatPump && pump.temperatures ? pump.temperatures(heatPump).catch(() => null) : null;
}

// Wymuszenie startu sprężarki powiązanej pompy ciepła (definicja kotła), gdy stoi albo nie wiadomo.
async function forcePumpIfDue(rootId: string, cycle: PelletBoilerWinterCycle, now: Date, pump: HeatPumpControl) {
  if (cycle.forcedAt && now.getTime() - cycle.forcedAt.getTime() < FORCE_REPEAT_MS) return;
  // CWU z peletu: pompa ciepła wstrzymana do ostygnięcia kotła
  if (pelletCwuBlocksPump(await getPelletCwu(rootId))) return;
  const heatPump = await linkedHeatPumpRootId(rootId);
  if (!heatPump) return;
  try {
    if (await pump.running(heatPump)) return;
    await pump.force(heatPump, `kocioł ${cycle.temperature ?? '?'} °C, woda w pompie ${cycle.pumpTemperature ?? '?'} °C < próg ${cycle.winterFrom ?? WINTER_FROM} °C, sprężarka stoi`);
    cycle.forcedAt = now;
    console.log(`[pellet zima] ${rootId} kocioł ${cycle.temperature} °C, pompa ${cycle.pumpTemperature} °C < ${cycle.winterFrom ?? WINTER_FROM} — wymuszam start sprężarki pompy ciepła`);
  } catch (error) {
    console.error('[pellet zima] wymuszenie startu pompy ciepła:', error);
  }
}

// Tryb „Pompa ciepła”: czy pracuje sprężarka pompy ciepła (zapis przy odczycie kotła, stan „Praca” w aplikacji).
// undefined: tryb Pellet, brak pompy ciepła albo jej świeżych danych.
export async function heatPumpRunningInHeatPumpMode(rootId: string, pump: HeatPumpControl = heatPumpControl) {
  const settings = await PelletBoilerSettingsModel.findOne({ rootId }).lean<PelletBoilerSettingsEntry>();
  if ((await effectiveBoilerMode(rootId, settings)) !== 'heat-pump') return undefined;
  const heatPump = await linkedHeatPumpRootId(rootId);
  if (!heatPump) return undefined;
  try {
    return (await pump.running(heatPump)) ?? undefined;
  } catch {
    return undefined;
  }
}
