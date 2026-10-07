// Odczyty PV (kolekcja pv): zapis z POST /pv/add, ostatni odczyt w pamięci per rootId,
// aktualne podsumowanie dla telemetrii HP (addHp, GET /hp) i usuwanie szczegółów
// paneli po 90 dniach (server.ts, co 24 h). Rekordy hp dostają tylko PV.total_power.
import { HpEntry, PvEntry, PvMetrics } from '../types';
import { PvEntryModel } from '../models/pv.model';
import { getDeviceInfo } from '../../../core/services/device-info.service';
import { comparisonKey, createPlateauWriter } from '../../../core/services/plateau-writer.service';
import { registerDevice } from '../../../core/services/device.service';
import { DeviceType } from '../../../core/types';

// Odczyt PV starszy niż ten limit nie opisuje już chwili pomiaru HP: nie
// trafia do rekordu hp (addHp) ani do bieżącej telemetrii (GET /hp).
// Sterownik czyta DTU co 60 s, więc limit obejmuje kilka odczytów.
export const PV_MAX_AGE_MS = 3 * 60 * 1000;

// Szczegóły portów (panels) są usuwane po tym czasie, podsumowanie zostaje.
export const PANEL_DETAILS_RETENTION_DAYS = 90;

const lastPvDataByRoot = new Map<string, PvEntry>();

type PvSummary = Pick<HpEntry, 'PV' | 'pv_power'>;

// PV bez panels w kształcie dawnej telemetrii HP (PV + pv_power na górnym poziomie),
// żeby klient nie wymagał zmian.
const toSummary = (entry: PvEntry): PvSummary => {
  const PV: PvMetrics = {
    total_power: entry.total_power,
    total_prod: entry.total_prod,
    total_prod_today: entry.total_prod_today,
    temperature: entry.temperature,
  };
  return { PV, pv_power: entry.pv_power };
};

// Zapis bez identycznych powtórzeń (core/services/plateau-writer.service.ts), głównie noc: porównanie
// pomija czas ze sterownika, temperatury (falowniki, porty) porównuje po zaokrągleniu do 0,5 °C.
const writePv = createPlateauWriter(PvEntryModel);
const pvKey = (cast: Record<string, unknown>) =>
  comparisonKey(cast, ['time'], { test: (key) => key === 'temperature', step: 0.5 });

export const addPvData = async (rootId: string, data: PvEntry) => {
  const device = await getDeviceInfo(rootId);
  const { doc } = await writePv(rootId, {
    time: data.time,
    total_power: data.total_power,
    total_prod: data.total_prod,
    total_prod_today: data.total_prod_today,
    temperature: data.temperature,
    pv_power: data.pv_power,
    panels: data.panels,
    rootId,
    deviceType: device.deviceType,
    deviceId: device.deviceId,
  }, pvKey);
  const stored = doc as unknown as PvEntry;
  lastPvDataByRoot.set(rootId, stored);
  await ensurePhotovoltaicDevice(device.deviceId);
  return stored;
};

// Urządzenie „Fotowoltaika” (moduł photovoltaic) o tym samym SN co sterownik co: zakładane przy
// pierwszym odczycie PV, raz na proces (DTU czyta co, więc fotowoltaika nie zgłasza się sama).
const photovoltaicEnsured = new Set<string>();
async function ensurePhotovoltaicDevice(deviceId: string) {
  if (photovoltaicEnsured.has(deviceId)) return;
  await registerDevice(DeviceType.PHOTOVOLTAIC, deviceId, 'Fotowoltaika');
  photovoltaicEnsured.add(deviceId);
}

// Po restarcie serwera pamięć podręczna jest pusta, więc pierwszy odczyt
// sięga do bazy.
export const getPvLastData = async (rootId: string): Promise<PvEntry | undefined> => {
  const cached = lastPvDataByRoot.get(rootId);
  if (cached) return cached;

  const last = await PvEntryModel
    .findOne({ rootId })
    .sort({ createdAt: -1 })
    .lean<PvEntry>();
  if (last) lastPvDataByRoot.set(rootId, last);
  return last ?? undefined;
};

export const getPvRange = (rootId: string, start: Date, end: Date) =>
  PvEntryModel
    .find({ rootId, createdAt: { $gte: start, $lt: end } })
    .sort({ createdAt: -1 })
    .lean<PvEntry[]>();

// Podsumowanie PV dla bieżącej telemetrii HP, o ile odczyt jest aktualny.
// undefined, gdy odczytu brak albo jest starszy niż PV_MAX_AGE_MS.
export const getFreshPvSummary = async (rootId: string, now = new Date()) => {
  const last = await getPvLastData(rootId);
  if (!last?.createdAt) return undefined;
  const age = now.getTime() - new Date(last.createdAt).getTime();
  return age >= 0 && age <= PV_MAX_AGE_MS ? toSummary(last) : undefined;
};

// Usuwa panels z odczytów starszych niż PANEL_DETAILS_RETENTION_DAYS; zwraca liczbę
// zmienionych dokumentów. Korzysta z indeksu {createdAt}.
export const removeExpiredPanelDetails = async (now = new Date()) => {
  const limit = new Date(now.getTime() - PANEL_DETAILS_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const result = await PvEntryModel.updateMany(
    { createdAt: { $lt: limit }, panels: { $exists: true } },
    { $unset: { panels: '' } },
  );
  return result.modifiedCount;
};
