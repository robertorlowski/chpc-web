// Cykl Zimy w trybie „Pompa ciepła” (zasada użytkownika z 2026-10-05). Kocioł jest wtedy rozdzielaczem ciepła
// z pompy ciepła, a po przełączeniu na Zimę pompa CO szybko wychładza wodę (poniżej 30 °C). Gdy kocioł ma być
// na Zimie (harmonogram sezonu, „Poza harmonogramem: Zima” albo przycisk „Zima” w Ustawieniach), sezonem
// steruje ten cykl, na temperaturze KOTŁA (heating_temp z ostatniego odczytu):
//   1. Lato, kocioł < WINTER_FROM (40 °C): pompa ciepła dostaje wymuszenie startu sprężarki (jak „Wymuszenie
//      pracy”), najwyżej co FORCE_REPEAT_MS; kocioł ≥ 40 °C: zlecenie Zima (nr 125 = 0). Czekanie do skutku.
//   2. Zima: pompa CO pracuje, woda stygnie.
//   3. Kocioł < SUMMER_BELOW (30 °C) i pompa CO kotła stoi: zlecenie Lato (nr 125 = 1), dalej punkt 1.
// Sezon kotła (Lato / Zima) bierze się z ostatniego odczytu ustawień (nr 125); zmiana z panelu jest więc
// przejmowana dopiero w kroku cyklu (Zima zostaje, dopóki pompa CO pracuje). Zlecenie sezonu w toku (pending,
// sent) wstrzymuje cykl do wyniku i nowego odczytu ustawień. Bez świeżego odczytu kotła cykl czeka.
// Moduły nie importują siebie nawzajem: stan i wymuszenie pompy ciepła idą przez API serwera (GET /hp,
// POST /operation/set), jak ładowanie CWU (pellet-boiler-pelux200-cwu-loading.service.ts).
import { fromZonedTime } from 'date-fns-tz';
import { TIME_ZONE } from '../../../core/time';
import { PelletBoilerSettingsEntry, PelletBoilerSettingsModel } from '../models/pellet-boiler-pelux200-settings.model';
import { PelletBoilerCommandModel } from '../models/pellet-boiler-pelux200-command.model';
import { PelletBoilerScheduleSettingsModel } from '../models/pellet-boiler-pelux200-schedule.model';
import { PelletBoilerSeason, PelletBoilerWinterCycle } from '../types';
import { createCommands } from './pellet-boiler-pelux200-command.service';
import { getPelletBoilerPelux200Last } from './pellet-boiler-pelux200.service';
import { effectiveBoilerMode, linkedHeatPumpRootId } from './pellet-boiler-pelux200-heat-pump-link.service';
import { getPelletCwu, pelletCwuBlocksPump } from './pellet-boiler-pelux200-pellet-cwu.service';

export const WINTER_FROM = 40;
export const SUMMER_BELOW = 30;
const SEASON_PARAMETER = 125;
const SEASON_VALUE: Record<PelletBoilerSeason, number> = { winter: 0, summer: 1 };
// wymuszenie startu sprężarki nie częściej niż co tyle (start trwa, co odpowiada co 10–30 s)
export const FORCE_REPEAT_MS = 10 * 60 * 1000;
// odczyt kotła co 60 s (poll_interval_seconds); starszy niż to = brak danych, cykl czeka
const READING_MAX_AGE_MS = 15 * 60 * 1000;

export type HeatPumpControl = {
  /** sprężarka pracuje (HP.HPS z ostatniej telemetrii); null = nie wiadomo */
  running: (heatPumpRootId: string) => Promise<boolean | null>;
  force: (heatPumpRootId: string) => Promise<void>;
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

export const heatPumpControl: HeatPumpControl = {
  // HP.HPS z ostatniej telemetrii, tylko świeżej (pompa offline = nie wiadomo)
  running: async (heatPumpRootId) => {
    const response = await fetch(`${internalApiUrl()}/hp?rootId=${encodeURIComponent(heatPumpRootId)}`);
    if (!response.ok) return null;
    const data = await response.json() as { HP?: { HPS?: unknown }; createdAt?: string; time?: string };
    const at = telemetryTime(data);
    if (data.HP?.HPS === undefined || !at || Date.now() - at.getTime() > PUMP_DATA_MAX_AGE_MS) return null;
    return Number(data.HP.HPS) > 0 || data.HP.HPS === true;
  },
  force: async (heatPumpRootId) => {
    const response = await fetch(`${internalApiUrl()}/operation/set?rootId=${encodeURIComponent(heatPumpRootId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force: '1' }),
    });
    if (!response.ok) throw new Error(`pompa ciepła: HTTP ${response.status}`);
  },
};

const saveCycle = (rootId: string, cycle: PelletBoilerWinterCycle | null) =>
  PelletBoilerScheduleSettingsModel.updateOne({ rootId }, { $set: { winterCycle: cycle } }, { upsert: true });

// Cykl nie działa (kocioł ma być na Lecie albo tryb Pellet): bez stanu.
export const stopWinterCycle = (rootId: string) =>
  PelletBoilerScheduleSettingsModel.updateOne({ rootId, winterCycle: { $ne: null } }, { $set: { winterCycle: null } });

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

  // zlecenie sezonu w toku: najpierw jego wynik i nowy odczyt ustawień
  const pending = await PelletBoilerCommandModel.exists({ rootId, kind: 'ecomax', index: SEASON_PARAMETER, status: { $in: ['pending', 'sent'] } });
  if (!pending && temperature !== null) {
    if (phase === 'waiting' && temperature >= WINTER_FROM) {
      await createCommands(rootId, { changes: [{ kind: 'ecomax', index: SEASON_PARAMETER, value: SEASON_VALUE.winter }] });
      console.log(`[pellet zima] ${rootId} kocioł ${temperature} °C ≥ ${WINTER_FROM} — Zima`);
    } else if (phase === 'winter' && temperature < SUMMER_BELOW && last?.heating_pump === false) {
      await createCommands(rootId, { changes: [{ kind: 'ecomax', index: SEASON_PARAMETER, value: SEASON_VALUE.summer }] });
      console.log(`[pellet zima] ${rootId} kocioł ${temperature} °C < ${SUMMER_BELOW}, pompa CO stoi — Lato, czekam na ciepły kocioł`);
    } else if (phase === 'waiting' && temperature < WINTER_FROM) {
      await forcePumpIfDue(rootId, cycle, now, pump);
    }
  }
  await saveCycle(rootId, cycle);
  return cycle;
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
    await pump.force(heatPump);
    cycle.forcedAt = now;
    console.log(`[pellet zima] ${rootId} kocioł ${cycle.temperature} °C < ${WINTER_FROM} — wymuszam start sprężarki pompy ciepła`);
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
