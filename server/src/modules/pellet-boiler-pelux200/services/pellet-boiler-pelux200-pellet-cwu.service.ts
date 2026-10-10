// CWU z peletu w trybie „Pompa ciepła” (decyzja użytkownika 2026-10-10). Kocioł zostaje w trybie pompy ciepła
// (minimum kotła nr 99 bez zmian, więc tryb z odczytu ustawień się nie zmienia), ale ciepłą wodę grzeje pellet,
// a pompa ciepła tylko CO. Znacznik „CWU grzej peletem” w Ustawieniach (PUT /pellet-boiler-pelux200/pellet-cwu).
// Krok co minutę (scheduler kotła, po harmonogramie), na ostatnim świeżym odczycie kotła:
//   idle    → regulator włączony i CWU (water_heater_temp) < „od” trybu Pellet (harmonogram Pellet albo jego ustawienie poza
//             harmonogramem): zadana kotła nr 98 i histereza nr 17 z nastaw trybu Pellet (profiles.pellet,
//             67 °C / 12) — kocioł rozpala i przy priorytecie CWU ładuje wodę; faza heating;
//   heating → CWU ≥ „do” trybu Pellet: nr 98 i 17 wracają do nastaw trybu Pompa ciepła (30 °C / 20), kocioł
//             wygasa; faza cooling. Przerwanie z błędem: brak palenia (stany 1–4) przez IGNITION_TIMEOUT_MS
//             albo grzanie dłuższe niż MAX_HEATING_MS; bez błędu: odznaczenie znacznika albo zmiana trybu;
//   cooling → kocioł < PELLET_CWU_PUMP_BLOCK_BELOW (50 °C): faza idle (najdłużej MAX_COOLING_MS bez odczytu).
// Od heating do końca cooling pompa ciepła jest wstrzymana (work_mode OFF przez PUT /hp/cwu-loading
// z pellet_block, cwu-loading.service.ts): gorąca woda z kotła w skraplaczu zatrzymałaby ją błędem Tho.
// Zima rozprowadza potem ciepło po CO (cykl Zimy przełącza sezon przy kotle ≥ 40 °C). Przy włączonym
// znaczniku harmonogram zleca CWU (nr 119, 123) z ustawień trybu Pellet, pompa ciepła nie ładuje CWU
// (47–49 °C), automatyczne przejście na Pellet po rozpaleniu i wymuszanie startu pompy w cyklu Zimy stoją.
import { sendMessage } from '../../../core/websocket';
import { PelletBoilerScheduleModel, PelletBoilerScheduleSettingsModel } from '../models/pellet-boiler-pelux200-schedule.model';
import { PelletBoilerSettingsEntry, PelletBoilerSettingsModel } from '../models/pellet-boiler-pelux200-settings.model';
import { PelletBoilerCommandChange, PelletBoilerPelletCwu, PelletBoilerScheduleEntry } from '../types';
import { createCommands } from './pellet-boiler-pelux200-command.service';
import { getPelletBoilerPelux200Last } from './pellet-boiler-pelux200.service';
import { effectiveBoilerMode } from './pellet-boiler-pelux200-heat-pump-link.service';
import { getScheduleSettings, scheduleState } from './pellet-boiler-pelux200-schedule.service';

export const PELLET_CWU_PUMP_BLOCK_BELOW = 50;
export const IGNITION_TIMEOUT_MS = 30 * 60 * 1000;
export const MAX_HEATING_MS = 3 * 60 * 60 * 1000;
const MAX_COOLING_MS = 6 * 60 * 60 * 1000;
// odczyt kotła co 60 s; starszy = brak danych, cykl czeka
const READING_MAX_AGE_MS = 15 * 60 * 1000;
// stabilizacja, rozpalanie, praca, nadzór
const BURNING_STATES = [1, 2, 3, 4];
// zadana i histereza kotła; wartości zapasowe, gdy nastawy trybu ich nie mają
const BOILER_PARAMETERS = [98, 17];
const FALLBACK: Record<'heat-pump' | 'pellet', Record<number, number>> = {
  'heat-pump': { 98: 30, 17: 20 },
  pellet: { 98: 67, 17: 12 },
};

const IDLE: PelletBoilerPelletCwu = { enabled: false, phase: 'idle', since: null };

export async function getPelletCwu(rootId: string): Promise<PelletBoilerPelletCwu> {
  const saved = (await PelletBoilerScheduleSettingsModel.findOne({ rootId }).select('pelletCwu')
    .lean<{ pelletCwu?: PelletBoilerPelletCwu }>())?.pelletCwu;
  return saved ? { ...IDLE, ...saved } : IDLE;
}

// Pompa ciepła wstrzymana (od grzania do ostygnięcia kotła).
export const pelletCwuBlocksPump = (state: PelletBoilerPelletCwu) => state.phase !== 'idle';

const save = (rootId: string, state: PelletBoilerPelletCwu) =>
  PelletBoilerScheduleSettingsModel.updateOne({ rootId }, { $set: { pelletCwu: state } }, { upsert: true });

// Zadana i histereza kotła z nastaw trybu. Zawsze obie, bez porównania z odczytem ustawień: w trakcie cyklu
// odczyt bywa sprzed poprzedniego zlecenia, a ponowny zapis tej samej wartości regulatorowi nie szkodzi.
async function boilerChanges(rootId: string, mode: 'heat-pump' | 'pellet') {
  const { profiles } = await getScheduleSettings(rootId);
  return BOILER_PARAMETERS.map((index): PelletBoilerCommandChange =>
    ({ kind: 'ecomax', index, value: profiles[mode][`ecomax:${index}`] ?? FALLBACK[mode][index] }));
}

// Znacznik z Ustawień; od razu krok cyklu (odznaczenie w trakcie grzania przywraca nastawy).
export async function setPelletCwuEnabled(rootId: string, enabled: boolean, now = new Date()) {
  const state = await getPelletCwu(rootId);
  await save(rootId, { ...state, enabled });
  return runPelletCwu(rootId, now);
}

// Jeden krok cyklu (scheduler kotła co minutę).
export async function runPelletCwu(rootId: string, now = new Date()): Promise<PelletBoilerPelletCwu> {
  const saved = await getPelletCwu(rootId);
  // znacznik wyłączony i nic nie trwa: bez pracy
  if (!saved.enabled && saved.phase === 'idle') return saved;

  const [settings, last, entries, scheduleSettings] = await Promise.all([
    PelletBoilerSettingsModel.findOne({ rootId }).lean<PelletBoilerSettingsEntry>(),
    getPelletBoilerPelux200Last(rootId) as Promise<{ heating_temp?: number; water_heater_temp?: number; state?: number; createdAt?: Date } | null>,
    PelletBoilerScheduleModel.find({ rootId }).lean<PelletBoilerScheduleEntry[]>(),
    getScheduleSettings(rootId),
  ]);
  const mode = await effectiveBoilerMode(rootId, settings);
  const fresh = !!last?.createdAt && now.getTime() - new Date(last.createdAt).getTime() < READING_MAX_AGE_MS;
  const boilerTemp = fresh && typeof last?.heating_temp === 'number' ? last.heating_temp : null;
  const cwuTemp = fresh && typeof last?.water_heater_temp === 'number' ? last.water_heater_temp : null;
  const { cwuFrom, cwuTo } = scheduleState(scheduleSettings, entries, 'pellet', now).state;
  const state: PelletBoilerPelletCwu = { ...saved, cwuFrom, cwuTo, boilerTemp, cwuTemp };
  const elapsed = state.since ? now.getTime() - new Date(state.since).getTime() : 0;
  const heatPumpMode = mode === 'heat-pump';
  // regulator włączony (świeży odczyt w stanie innym niż 0): przy wyłączonym kotle cykl nie startuje
  const regulatorOn = fresh && typeof last?.state === 'number' && last.state !== 0;

  // koniec grzania: nastawy pompy ciepła (tylko w jej trybie; po przejściu na Pellet zostają nastawy Pelletu)
  const finish = async (error: string | null) => {
    if (heatPumpMode) {
      const changes = await boilerChanges(rootId, 'heat-pump');
      if (changes.length) await createCommands(rootId, { changes });
    }
    Object.assign(state, { phase: 'cooling', since: now, burning: false, error });
    console.log(`[pellet cwu z peletu] ${rootId} koniec grzania CWU${error ? ` — ${error}` : ''}, pompa ciepła czeka na kocioł < ${PELLET_CWU_PUMP_BLOCK_BELOW} °C`);
  };

  try {
    if (state.phase === 'idle') {
      if (state.enabled && heatPumpMode && regulatorOn && cwuTemp !== null && cwuTemp < cwuFrom) {
        const changes = await boilerChanges(rootId, 'pellet');
        if (changes.length) await createCommands(rootId, { changes });
        Object.assign(state, { phase: 'heating', since: now, burning: false, error: null });
        console.log(`[pellet cwu z peletu] ${rootId} CWU ${cwuTemp} °C < ${cwuFrom} — kocioł grzeje CWU peletem do ${cwuTo} °C`);
      }
    } else if (state.phase === 'heating') {
      if (fresh && BURNING_STATES.includes(last?.state ?? -1)) state.burning = true;
      if (!state.enabled || !heatPumpMode) await finish(null);
      else if (cwuTemp !== null && cwuTemp >= cwuTo) await finish(null);
      else if (!state.burning && elapsed > IGNITION_TIMEOUT_MS) await finish(`kocioł nie rozpalił się w ${IGNITION_TIMEOUT_MS / 60000} min`);
      else if (elapsed > MAX_HEATING_MS) await finish(`grzanie CWU trwało dłużej niż ${MAX_HEATING_MS / 3600000} h`);
    } else if ((boilerTemp !== null && boilerTemp < PELLET_CWU_PUMP_BLOCK_BELOW) || elapsed > MAX_COOLING_MS) {
      Object.assign(state, { phase: 'idle', since: now });
      console.log(`[pellet cwu z peletu] ${rootId} kocioł ${boilerTemp ?? '?'} °C — pompa ciepła znowu pracuje`);
    }
  } catch (error) {
    // np. wartość poza zakresem regulatora: faza bez zmian, następna próba za minutę
    state.error = String((error as Error).message ?? error);
  }
  await save(rootId, state);
  if (state.phase !== saved.phase || state.error !== saved.error) sendMessage('update', rootId);
  return state;
}
