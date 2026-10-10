// Włączenie regulatora w trybie „Pompa ciepła” (decyzja użytkownika 2026-10-10). W tym trybie kocioł ma nastawy
// rezerwy (zadana 30 °C, histereza 20), ale regulator podnosi zadaną do zadanej CWU (albo mieszacza zimą)
// + podwyższenie (nr 105), gdy CWU czeka na ładowanie. Przy zimnym kotle (pompa ciepła wyłączona) włączenie
// rozpaliłoby więc pellet, a serwer zaraz przełączyłby kocioł na Pellet (auto-pellet.service.ts).
// predictIgnition liczy to jak regulator (instrukcja 860P str. 12, 41, 42):
//   zadana = nr 98; CWU czeka (nr 122 ≠ 0 i CWU < nr 119 − nr 123) → max(zadana, nr 119 + nr 105);
//   Zima (nr 125 = 0) i zadana mieszacza 1 z odczytu → max(zadana, mieszacz + nr 105);
//   rozpalenie, gdy kocioł < zadana − nr 17.
// Zlecenie „włącz” z aplikacji (POST /commands z control = 1) jest wtedy odrzucane (409, turnOnCheck), chyba że
// rozpalenie wynika tylko z CWU, a włączony jest znacznik „CWU grzej peletem” (pellet-cwu.service.ts) — wtedy
// pellet ma grzać CWU. Aplikacja proponuje: przełączenie na Pellet, uruchomienie pompy ciepła albo włączenie
// po nagrzaniu kotła (pendingTurnOn: scheduler kotła co minutę zleca „włącz”, gdy kocioł nie rozpali się już
// w trybie pompy ciepła albo kocioł jest w trybie Pellet; wygasa po PENDING_MAX_MS).
// Panelu kotła nie da się zablokować — to tylko zlecenia z aplikacji.
import { sendMessage } from '../../../core/websocket';
import { PelletBoilerScheduleSettingsModel } from '../models/pellet-boiler-pelux200-schedule.model';
import { PelletBoilerSettingsEntry, PelletBoilerSettingsModel } from '../models/pellet-boiler-pelux200-settings.model';
import { PelletBoilerCommandChange, PelletBoilerPendingTurnOn, PelletBoilerTurnOnCheck } from '../types';
import { CommandError, createCommands } from './pellet-boiler-pelux200-command.service';
import { getPelletBoilerPelux200Last } from './pellet-boiler-pelux200.service';
import { linkedHeatPumpRootId } from './pellet-boiler-pelux200-heat-pump-link.service';
import { getPelletCwu } from './pellet-boiler-pelux200-pellet-cwu.service';
import { buildSettingsView } from './pellet-boiler-pelux200-settings.service';

// włączenie po nagrzaniu kotła czeka najwyżej tyle (np. pompa ciepła nie grzeje wody w kotle)
export const PENDING_MAX_MS = 12 * 60 * 60 * 1000;
// odczyt kotła co 60 s; starszy = brak danych
const READING_MAX_AGE_MS = 15 * 60 * 1000;
// minimalna temperatura kotła (nr 99) poniżej 50 °C = tryb pompy ciepła (jak boilerMode w settings.service.ts)
const HEAT_PUMP_MODE_BELOW = 50;

type Reading = { heating_temp?: number; water_heater_temp?: number; mixer1_target?: number; createdAt?: Date };

// Wartość surowa parametru kotła: z tego samego zlecenia (np. zmiana trybu z „włącz” na końcu), inaczej z odczytu.
function parameterOf(settings: PelletBoilerSettingsEntry | null, changes: PelletBoilerCommandChange[]) {
  const view = settings ? buildSettingsView(settings) : null;
  return (index: number): number | undefined => {
    const planned = changes.find((c) => c.kind === 'ecomax' && c.index === index);
    if (planned) return planned.value;
    return view?.groups.flatMap((g) => g.parameters).find((p) => p.index === index)?.raw[0];
  };
}

// Czy włączenie regulatora rozpali kocioł i dlaczego. changes: zmiany z tego samego zlecenia.
export async function predictIgnition(rootId: string, changes: PelletBoilerCommandChange[] = [], now = new Date()): Promise<PelletBoilerTurnOnCheck> {
  const [settings, last, heatPump] = await Promise.all([
    PelletBoilerSettingsModel.findOne({ rootId }).lean<PelletBoilerSettingsEntry>(),
    getPelletBoilerPelux200Last(rootId) as Promise<Reading | null>,
    linkedHeatPumpRootId(rootId),
  ]);
  const value = parameterOf(settings, changes);
  const minimum = value(99);
  const mode = heatPump && minimum !== undefined && minimum < HEAT_PUMP_MODE_BELOW ? 'heat-pump' : 'pellet';
  const fresh = !!last?.createdAt && now.getTime() - new Date(last.createdAt).getTime() < READING_MAX_AGE_MS;
  const boilerTemp = fresh && typeof last?.heating_temp === 'number' ? last.heating_temp : null;
  const cwuTemp = fresh && typeof last?.water_heater_temp === 'number' ? last.water_heater_temp : null;
  const result: PelletBoilerTurnOnCheck = { mode, ignites: false, cause: null, boilerTemp, cwuTemp };
  const target = value(98), hysteresis = value(17), increase = value(105) ?? 0;
  if (mode !== 'heat-pump' || boilerTemp === null || target === undefined || hysteresis === undefined) return result;

  let effective = target;
  let cause: PelletBoilerTurnOnCheck['cause'] = 'boiler';
  const cwuTarget = value(119), cwuHysteresis = value(123), cwuMode = value(122);
  if (cwuMode !== 0 && cwuTarget !== undefined && cwuHysteresis !== undefined && cwuTemp !== null) {
    result.cwuStartBelow = cwuTarget - cwuHysteresis;
    if (cwuTemp < result.cwuStartBelow && cwuTarget + increase > effective) {
      effective = cwuTarget + increase;
      cause = 'cwu';
    }
  }
  const mixerTarget = fresh && typeof last?.mixer1_target === 'number' ? last.mixer1_target : undefined;
  if (value(125) === 0 && mixerTarget !== undefined && mixerTarget + increase > effective) {
    effective = mixerTarget + increase;
    cause = 'mixer';
  }
  result.target = effective;
  result.startBelow = effective - hysteresis;
  result.ignites = boilerTemp < result.startBelow;
  result.cause = result.ignites ? cause : null;
  return result;
}

// Opis dla aplikacji (okno po „Włącz regulator” i komunikat 409).
export function describeIgnition(check: PelletBoilerTurnOnCheck) {
  const why = check.cause === 'cwu'
    ? `CWU (${check.cwuTemp?.toFixed(1)} °C) jest poniżej ${check.cwuStartBelow} °C, więc regulator podniesie zadaną kotła do ${check.target} °C`
    : check.cause === 'mixer'
      ? `zimą mieszacz podniesie zadaną kotła do ${check.target} °C`
      : `zadana kotła to ${check.target} °C`;
  return `W trybie Pompa ciepła kocioł ma ${check.boilerTemp?.toFixed(1)} °C, a rozpali się poniżej ${check.startBelow} °C: ${why}. `
    + 'Zaraz po rozpaleniu serwer przełączyłby kocioł na Pellet. Najpierw przełącz kocioł na Pellet albo uruchom pompę ciepła.';
}

// Zlecenie z aplikacji: przy „włącz” w trybie pompy ciepła, które rozpaliłoby kocioł — 409 z opisem.
export async function turnOnCheck(rootId: string, changes: PelletBoilerCommandChange[], now = new Date()) {
  if (!changes.some((c) => c.kind === 'control' && c.value === 1)) return null;
  const check = await predictIgnition(rootId, changes, now);
  if (!check.ignites) return null;
  // CWU z peletu: rozpalenie na CWU jest zamierzone
  if (check.cause === 'cwu' && (await getPelletCwu(rootId)).enabled) return null;
  return check;
}

// --- włączenie po nagrzaniu kotła ---

export async function getPendingTurnOn(rootId: string): Promise<PelletBoilerPendingTurnOn | null> {
  return (await PelletBoilerScheduleSettingsModel.findOne({ rootId }).select('pendingTurnOn')
    .lean<{ pendingTurnOn?: PelletBoilerPendingTurnOn | null }>())?.pendingTurnOn ?? null;
}

const savePending = (rootId: string, pending: PelletBoilerPendingTurnOn | null) =>
  PelletBoilerScheduleSettingsModel.updateOne({ rootId }, { $set: { pendingTurnOn: pending } }, { upsert: true });

// Pompa ciepła powiązana z kotłem: tryb OFF → ręczny (ustawienia domyślne pompy), przez API jak każdy klient
// (PUT /device/properties zastępuje całe properties, więc najpierw odczyt). Zwraca true, gdy pompa była wyłączona.
export type HeatPumpStarter = (heatPumpRootId: string) => Promise<boolean>;
const internalApiUrl = () => process.env.INTERNAL_API_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3001}/api`;
export const startHeatPumpViaApi: HeatPumpStarter = async (heatPumpRootId) => {
  const url = `${internalApiUrl()}/device/properties?rootId=${encodeURIComponent(heatPumpRootId)}`;
  const current = await fetch(url);
  if (!current.ok) throw new Error(`pompa ciepła: HTTP ${current.status}`);
  const properties = await current.json() as Record<string, unknown>;
  if (properties.work_mode !== 'OFF') return false;
  const saved = await fetch(url, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...properties, work_mode: 'MANUAL' }),
  });
  if (!saved.ok) throw new Error(`pompa ciepła: HTTP ${saved.status}`);
  return true;
};

// Akcja z okna aplikacji: włącz po nagrzaniu (when-warm), uruchom pompę ciepła i włącz po nagrzaniu
// (start-heat-pump) albo anuluj czekające włączenie (cancel).
export async function turnOnAction(
  rootId: string, action: 'when-warm' | 'start-heat-pump' | 'cancel', now = new Date(), start: HeatPumpStarter = startHeatPumpViaApi,
) {
  if (action === 'cancel') {
    await savePending(rootId, null);
    sendMessage('update', rootId);
    return null;
  }
  let heatPumpStarted = false;
  if (action === 'start-heat-pump') {
    const heatPump = await linkedHeatPumpRootId(rootId);
    if (!heatPump) throw new CommandError('Kocioł nie ma powiązanej pompy ciepła (Dane sterownika).', 409);
    heatPumpStarted = await start(heatPump);
  }
  const check = await predictIgnition(rootId, [], now);
  const pending: PelletBoilerPendingTurnOn = { since: now, startBelow: check.startBelow ?? null, heatPumpStarted };
  await savePending(rootId, pending);
  await runPendingTurnOn(rootId, now);
  sendMessage('update', rootId);
  return getPendingTurnOn(rootId);
}

// Krok schedulera kotła (co minutę): czekające włączenie, gdy kocioł już się nie rozpali w trybie pompy ciepła
// (woda nagrzana) albo jest w trybie Pellet; po PENDING_MAX_MS rezygnacja z opisem.
export async function runPendingTurnOn(rootId: string, now = new Date()) {
  const pending = await getPendingTurnOn(rootId);
  if (!pending) return null;
  if (now.getTime() - new Date(pending.since).getTime() > PENDING_MAX_MS) {
    await savePending(rootId, null);
    await PelletBoilerScheduleSettingsModel.updateOne({ rootId }, {
      $set: { lastError: `Włączenie kotła anulowane: kocioł nie nagrzał się do ${pending.startBelow ?? '?'} °C w ${PENDING_MAX_MS / 3600000} h.` },
    });
    sendMessage('update', rootId);
    return null;
  }
  const check = await predictIgnition(rootId, [], now);
  if (check.boilerTemp === null && check.mode === 'heat-pump') return pending;  // bez świeżego odczytu czeka
  if (check.ignites && !(check.cause === 'cwu' && (await getPelletCwu(rootId)).enabled)) {
    // próg może się zmienić (np. CWU się podgrzała): aktualny dla ekranu
    if ((check.startBelow ?? null) !== pending.startBelow) {
      await savePending(rootId, { ...pending, startBelow: check.startBelow ?? null });
    }
    return pending;
  }
  try {
    await createCommands(rootId, { changes: [{ kind: 'control', index: 0, value: 1 }] });
    await PelletBoilerScheduleSettingsModel.updateOne({ rootId }, { $set: { enabled: true } });
    console.log(`[pellet] ${rootId} kocioł ${check.boilerTemp ?? '?'} °C — włączam regulator (czekał na nagrzanie)`);
  } catch (error) {
    // np. kocioł nie odpowiada: następna próba za minutę
    console.error('[pellet] włączenie po nagrzaniu:', error);
    return pending;
  }
  await savePending(rootId, null);
  sendMessage('update', rootId);
  return null;
}
