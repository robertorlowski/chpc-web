// CWU z peletu w trybie „Pompa ciepła” (decyzja użytkownika 2026-10-10). Kocioł zostaje w trybie pompy ciepła,
// ale ciepłą wodę grzeje pellet, a pompa ciepła tylko CO. Znacznik „CWU grzej peletem” w Ustawieniach
// (PUT /pellet-boiler-pelux200/pellet-cwu). Na czas cyklu kocioł dostaje nr 98, 99, 17 i 101 z nastaw trybu Pellet
// (2026-10-13, po nocy 12/13.10: przy 99 = 30 i 101 = 30 pellet grzał CO), mimo 99 = 65 serwer i aplikacja traktują go
// w fazach heating i cooling jako tryb „Pompa ciepła” (effectiveBoilerMode, heat-pump-link.service.ts). Nr 99 zmieniony
// z aplikacji w trakcie cyklu (wybór trybu pracy) kończy cykl bez przywracania nastaw (pelletCwuModeChanged).
// Krok co minutę (scheduler kotła, po harmonogramie), na ostatnim świeżym odczycie kotła:
//   idle    → regulator włączony, CWU w kotle włączone (nr 122 ≠ 0; przy wyłączonym cykl nie startuje i go nie włącza)
//             i CWU (water_heater_temp) < „od” trybu Pellet (harmonogram Pellet albo jego ustawienie poza harmonogramem):
//             nastawy trybu Pellet w kolejności 98 → 99 → 17 → 101 (67 / 65 / 12 / 50) — kocioł rozpala i przy
//             priorytecie CWU ładuje wodę; faza heating;
//   heating → CWU ≥ „do” trybu Pellet: nastawy trybu Pompa ciepła w kolejności 99 → 98 → 17 → 101 (30 / 30 / 20 / 30),
//             kocioł wygasa; faza cooling. Przerwanie z błędem: brak palenia (stany 1–4) przez IGNITION_TIMEOUT_MS
//             albo grzanie dłuższe niż MAX_HEATING_MS; bez błędu: odznaczenie znacznika, zmiana trybu albo CWU
//             wyłączone w kotle (nr 122 = 0);
//   cooling → kocioł < PELLET_CWU_PUMP_BLOCK_BELOW (52 °C): faza idle (najdłużej MAX_COOLING_MS bez odczytu); pompa
//             rusza przy kotle < 50 °C (histereza zasady „kocioł gorący”, cwu-loading.service.ts).
// Od heating do końca cooling pompa ciepła jest wstrzymana (work_mode OFF przez PUT /hp/cwu-loading
// z pellet_block, cwu-loading.service.ts): gorąca woda z kotła w skraplaczu zatrzymałaby ją błędem Tho.
// Zima rozprowadza potem ciepło po CO (cykl Zimy przełącza sezon przy kotle ≥ max pompy ciepła − 3 °C). Przy włączonym
// znaczniku harmonogram zleca CWU (nr 119, 123) z ustawień trybu Pellet, pompa ciepła nie ładuje CWU
// (47–49 °C), automatyczne przejście na Pellet po rozpaleniu i wymuszanie startu pompy w cyklu Zimy stoją.
import { sendMessage } from '../../../core/websocket';
import { PelletBoilerScheduleModel, PelletBoilerScheduleSettingsModel } from '../models/pellet-boiler-pelux200-schedule.model';
import { PelletBoilerSettingsEntry, PelletBoilerSettingsModel } from '../models/pellet-boiler-pelux200-settings.model';
import { PelletBoilerCommandChange, PelletBoilerPelletCwu, PelletBoilerScheduleEntry } from '../types';
import { createCommands } from './pellet-boiler-pelux200-command.service';
import { systemMeta } from '../../../core/services/operation-log.service';
import { getPelletBoilerPelux200Last } from './pellet-boiler-pelux200.service';
import { buildSettingsView } from './pellet-boiler-pelux200-settings.service';
import { effectiveBoilerMode } from './pellet-boiler-pelux200-heat-pump-link.service';
import { boilerCwuSetting, getScheduleSettings, scheduleState } from './pellet-boiler-pelux200-schedule.service';

// próg gorącego kotła (wartość zapasowa, zwykle z odpowiedzi pompy); UWAGA: podniesienie maksymalnej temperatury pompy powyżej 50 °C wymaga podniesienia progu wstrzymania pompy przy gorącym kotle
// (BOILER_BLOCK_FROM 52 °C = maks. 50 + 2, server/src/modules/heat-pump/services/cwu-loading.service.ts), inaczej pompa
// zatrzyma się na wodzie, którą sama nagrzała
export const PELLET_CWU_PUMP_BLOCK_BELOW = 52;
const PUMP_RESUME_BELOW = PELLET_CWU_PUMP_BLOCK_BELOW - 2;
export const IGNITION_TIMEOUT_MS = 30 * 60 * 1000;
export const MAX_HEATING_MS = 3 * 60 * 60 * 1000;
const MAX_COOLING_MS = 6 * 60 * 60 * 1000;
// odczyt kotła co 60 s; starszy = brak danych, cykl czeka
const READING_MAX_AGE_MS = 15 * 60 * 1000;
// stabilizacja, rozpalanie, praca, nadzór
const BURNING_STATES = [1, 2, 3, 4];
// zadana (98), minimum (99), histereza (17) kotła i start pompy CO (101); kolejność zleceń: zadana przed minimum przy
// podnoszeniu (Pellet), minimum przed zadaną przy obniżaniu (Pompa ciepła), żeby minimum nie przekroczyło zadanej.
// Wartości zapasowe, gdy nastawy trybu ich nie mają. Nr 105, 122, mieszacz i sezon bez zmian.
const BOILER_PARAMETERS: Record<'heat-pump' | 'pellet', number[]> = {
  'heat-pump': [99, 98, 17, 101],
  pellet: [98, 99, 17, 101],
};
const FALLBACK: Record<'heat-pump' | 'pellet', Record<number, number>> = {
  'heat-pump': { 98: 30, 99: 30, 17: 20, 101: 30 },
  pellet: { 98: 67, 99: 65, 17: 12, 101: 50 },
};
// CWU w regulatorze (nr 122): 0 = wyłączone
const CWU_ENABLED_PARAMETER = 122;

const IDLE: PelletBoilerPelletCwu = { enabled: false, phase: 'idle', since: null };

// koniec stygnięcia: próg gorącego kotła z ustawień pompy ciepła (zapisany przy zgłoszeniu do pompy, cwu-loading.service.ts)
async function pumpBlockBelow(rootId: string) {
  const saved = await PelletBoilerScheduleSettingsModel.findOne({ rootId }).select('cwuLoading')
    .lean<{ cwuLoading?: { hotBoilerFrom?: number } }>();
  return saved?.cwuLoading?.hotBoilerFrom ?? PELLET_CWU_PUMP_BLOCK_BELOW;
}

export async function getPelletCwu(rootId: string): Promise<PelletBoilerPelletCwu> {
  const saved = (await PelletBoilerScheduleSettingsModel.findOne({ rootId }).select('pelletCwu')
    .lean<{ pelletCwu?: PelletBoilerPelletCwu }>())?.pelletCwu;
  return saved ? { ...IDLE, ...saved } : IDLE;
}

// Pompa ciepła wstrzymana (od grzania do ostygnięcia kotła).
export const pelletCwuBlocksPump = (state: PelletBoilerPelletCwu) => state.phase !== 'idle';

const save = (rootId: string, state: PelletBoilerPelletCwu) =>
  PelletBoilerScheduleSettingsModel.updateOne({ rootId }, { $set: { pelletCwu: state } }, { upsert: true });

// Nastawy kotła (98, 99, 17, 101) z nastaw trybu, w kolejności trybu. Zawsze wszystkie, bez porównania z odczytem
// ustawień: w trakcie cyklu odczyt bywa sprzed poprzedniego zlecenia, a ponowny zapis tej samej wartości regulatorowi
// nie szkodzi.
async function boilerChanges(rootId: string, mode: 'heat-pump' | 'pellet') {
  const { profiles } = await getScheduleSettings(rootId);
  return BOILER_PARAMETERS[mode].map((index): PelletBoilerCommandChange =>
    ({ kind: 'ecomax', index, value: profiles[mode][`ecomax:${index}`] ?? FALLBACK[mode][index] }));
}

// CWU włączone w regulatorze (nr 122 ≠ 0) według ostatniego odczytu ustawień; bez odczytu — nie wiadomo, więc tak.
const cwuEnabledInBoiler = (settings: PelletBoilerSettingsEntry | null) =>
  !settings || buildSettingsView(settings).groups.flatMap((g) => g.parameters)
    .find((p) => p.index === CWU_ENABLED_PARAMETER)?.raw[0] !== 0;

// Zlecenie z aplikacji (POST /commands) zmienia nr 99 w trakcie cyklu: użytkownik wybrał tryb pracy, więc cykl się
// kończy bez przywracania nastaw (inaczej nadpisałby wybór). Pompa ciepła (99 < 50) — stygnięcie jak po zwykłym końcu,
// Pellet — od razu idle (tryb Pellet nie wstrzymuje pompy ciepła przez cykl).
export async function pelletCwuModeChanged(rootId: string, changes: PelletBoilerCommandChange[], now = new Date()) {
  const minimum = changes.find((change) => change.kind === 'ecomax' && change.index === 99);
  if (!minimum) return;
  const state = await getPelletCwu(rootId);
  if (state.phase === 'idle') return;
  const heatPump = minimum.value < 50;
  if (heatPump && state.phase === 'cooling') return;
  await save(rootId, { ...state, phase: heatPump ? 'cooling' : 'idle', since: now, burning: false, error: null });
  console.log(`[pellet cwu z peletu] ${rootId} tryb pracy zmieniony z aplikacji (nr 99 = ${minimum.value}) — koniec cyklu bez przywracania nastaw`);
  sendMessage('update', rootId);
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
  // progi od–do: harmonogram trybu Pellet; przy CWU „bez zmiany” poza wpisami — CWU ustawione w kotle (nr 119, 119 − 123)
  const scheduled = scheduleState(scheduleSettings, entries, 'pellet', now).state;
  const fromBoiler = scheduled.cwuUnchanged ? await boilerCwuSetting(rootId, settings) : {};
  const cwuTo = fromBoiler.cwuTo ?? scheduled.cwuTo;
  const cwuFrom = fromBoiler.cwuFrom ?? scheduled.cwuFrom;
  const state: PelletBoilerPelletCwu = { ...saved, cwuFrom, cwuTo, boilerTemp, cwuTemp };
  const elapsed = state.since ? now.getTime() - new Date(state.since).getTime() : 0;
  const heatPumpMode = mode === 'heat-pump';
  // regulator włączony (świeży odczyt w stanie innym niż 0): przy wyłączonym kotle cykl nie startuje
  const regulatorOn = fresh && typeof last?.state === 'number' && last.state !== 0;
  // CWU wyłączone w regulatorze (nr 122 = 0): cykl nie startuje, a trwający się kończy (noc 12/13.10: pellet grzał CO)
  const cwuOn = cwuEnabledInBoiler(settings);

  // koniec grzania: nastawy pompy ciepła (tylko w jej trybie; po przejściu na Pellet zostają nastawy Pelletu)
  const finish = async (error: string | null) => {
    if (heatPumpMode) {
      const changes = await boilerChanges(rootId, 'heat-pump');
      if (changes.length) {
        await createCommands(rootId, { changes }, systemMeta(
          'CWU z peletu',
          error ? `Koniec grzania CWU peletem: ${error} — nastawy trybu Pompa ciepła.` : 'Koniec grzania CWU peletem — nastawy trybu Pompa ciepła.',
          `CWU ${cwuTemp === null || cwuTemp === undefined ? '?' : cwuTemp} °C, cel ${cwuTo} °C; pompa ciepła czeka na kocioł poniżej ${PUMP_RESUME_BELOW} °C`,
        ));
      }
    }
    Object.assign(state, { phase: 'cooling', since: now, burning: false, error });
    console.log(`[pellet cwu z peletu] ${rootId} koniec grzania CWU${error ? ` — ${error}` : ''}, pompa ciepła czeka na kocioł < ${PUMP_RESUME_BELOW} °C`);
  };

  try {
    if (state.phase === 'idle') {
      if (state.enabled && heatPumpMode && regulatorOn && cwuOn && cwuTemp !== null && cwuTemp < cwuFrom) {
        const changes = await boilerChanges(rootId, 'pellet');
        if (changes.length) {
          await createCommands(rootId, { changes }, systemMeta(
            'CWU z peletu', 'Włączone „CWU - grzanie peletem”: kocioł grzeje CWU peletem — nastawy kotła trybu Pellet (98, 99, 17, 101).',
            `CWU ${cwuTemp === null || cwuTemp === undefined ? '?' : cwuTemp} °C poniżej „od” ${cwuFrom} °C, cel ${cwuTo} °C; regulator włączony`,
          ));
        }
        Object.assign(state, { phase: 'heating', since: now, burning: false, error: null });
        console.log(`[pellet cwu z peletu] ${rootId} CWU ${cwuTemp} °C < ${cwuFrom} — kocioł grzeje CWU peletem do ${cwuTo} °C`);
      }
    } else if (state.phase === 'heating') {
      if (fresh && BURNING_STATES.includes(last?.state ?? -1)) state.burning = true;
      if (!state.enabled || !heatPumpMode || !cwuOn) await finish(null);
      else if (cwuTemp !== null && cwuTemp >= cwuTo) await finish(null);
      else if (!state.burning && elapsed > IGNITION_TIMEOUT_MS) await finish(`kocioł nie rozpalił się w ${IGNITION_TIMEOUT_MS / 60000} min`);
      else if (elapsed > MAX_HEATING_MS) await finish(`grzanie CWU trwało dłużej niż ${MAX_HEATING_MS / 3600000} h`);
    } else if ((boilerTemp !== null && boilerTemp < await pumpBlockBelow(rootId)) || elapsed > MAX_COOLING_MS) {
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
