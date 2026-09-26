import { HpEntry, PvEntry, PvMetrics } from '../middleware/type';
import { PvEntryModel } from '../models/model';
import { getDeviceInfo } from './hp.service';

// Odczyt PV starszy niż ten limit nie opisuje już chwili pomiaru HP: nie
// trafia do rekordu hp (addHp) ani do bieżącej telemetrii (GET /hp).
// Sterownik czyta DTU co 60 s, więc limit obejmuje kilka odczytów.
export const PV_MAX_AGE_MS = 3 * 60 * 1000;

// Szczegóły portów (panels) są usuwane po tym czasie, podsumowanie zostaje.
export const PANEL_DETAILS_RETENTION_DAYS = 90;

const lastPvDataByRoot = new Map<string, PvEntry>();

type PvSummary = Pick<HpEntry, 'PV' | 'pv_power'>;

const toSummary = (entry: PvEntry): PvSummary => {
  const PV: PvMetrics = {
    total_power: entry.total_power,
    total_prod: entry.total_prod,
    total_prod_today: entry.total_prod_today,
    temperature: entry.temperature,
  };
  return { PV, pv_power: entry.pv_power };
};

export const addPvData = async (rootId: string, data: PvEntry) => {
  const device = await getDeviceInfo(rootId);
  const doc = await PvEntryModel.create({
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
  });
  const stored = doc.toObject() as PvEntry;
  lastPvDataByRoot.set(rootId, stored);
  return stored;
};

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
export const getFreshPvSummary = async (rootId: string, now = new Date()) => {
  const last = await getPvLastData(rootId);
  if (!last?.createdAt) return undefined;
  const age = now.getTime() - new Date(last.createdAt).getTime();
  return age >= 0 && age <= PV_MAX_AGE_MS ? toSummary(last) : undefined;
};

export const removeExpiredPanelDetails = async (now = new Date()) => {
  const limit = new Date(now.getTime() - PANEL_DETAILS_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const result = await PvEntryModel.updateMany(
    { createdAt: { $lt: limit }, panels: { $exists: true } },
    { $unset: { panels: '' } },
  );
  return result.modifiedCount;
};
