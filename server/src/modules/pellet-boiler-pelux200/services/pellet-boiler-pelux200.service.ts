// Odczyty kotła Pellux 200: walidacja body sterownika, zapis, ostatni odczyt
// w pamięci per rootId (po restarcie serwera z bazy) i lista z jednego dnia.
import { PelletBoilerPelux200Entry, PelletBoilerPelux200Measurements } from '../types';
import { PelletBoilerPelux200Model } from '../models/pellet-boiler-pelux200.model';
import { getDeviceInfo } from '../../../core/services/device-info.service';
import { DeviceModel } from '../../../core/models/device.model';
import { sendMessage } from '../../../core/websocket';

export const DEFAULT_POLL_INTERVAL_SECONDS = 300;

const NUMBER_FIELDS = [
  'state', 'heating_temp', 'feeder_temp', 'water_heater_temp', 'outside_temp', 'return_temp',
  'exhaust_temp', 'optical_temp', 'upper_buffer_temp', 'lower_buffer_temp', 'heating_target',
  'water_heater_target', 'heating_status', 'water_heater_status', 'fuel_level', 'fan_power',
  'boiler_load', 'boiler_power', 'fuel_consumption', 'lambda_level',
] as const;
const BOOLEAN_FIELDS = [
  'fan', 'feeder', 'heating_pump', 'water_heater_pump', 'circulation_pump', 'lighter', 'alarm',
] as const;

// Zwraca tylko znane pola pomiarowe albo null, gdy body nie jest obiektem, pole
// ma zły typ (liczba skończona / boolean) albo nie ma żadnego pola pomiarowego.
// Pole `time` i nieznane klucze są ignorowane.
export function validateReading(body: unknown): PelletBoilerPelux200Measurements | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const source = body as Record<string, unknown>;
  const result: Record<string, number | boolean> = {};
  for (const key of NUMBER_FIELDS) {
    if (source[key] === undefined) continue;
    if (typeof source[key] !== 'number' || !Number.isFinite(source[key])) return null;
    result[key] = source[key] as number;
  }
  for (const key of BOOLEAN_FIELDS) {
    if (source[key] === undefined) continue;
    if (typeof source[key] !== 'boolean') return null;
    result[key] = source[key] as boolean;
  }
  return Object.keys(result).length ? result : null;
}

const lastByRoot = new Map<string, PelletBoilerPelux200Entry>();

export async function addPelletBoilerPelux200Reading(
  rootId: string,
  reading: PelletBoilerPelux200Measurements,
) {
  const device = await getDeviceInfo(rootId);
  const doc = await PelletBoilerPelux200Model.create({
    ...reading, rootId, deviceType: device.deviceType, deviceId: device.deviceId,
  });
  lastByRoot.set(rootId, doc.toObject() as PelletBoilerPelux200Entry);
  sendMessage('update', rootId);
  return doc;
}

export async function getPelletBoilerPelux200Last(rootId: string) {
  const cached = lastByRoot.get(rootId);
  if (cached) return cached;
  const last = await PelletBoilerPelux200Model
    .findOne({ rootId }).sort({ createdAt: -1 }).lean<PelletBoilerPelux200Entry>();
  if (last) lastByRoot.set(rootId, last);
  return last ?? undefined;
}

export const getPelletBoilerPelux200Range = (rootId: string, start: Date, end: Date) =>
  PelletBoilerPelux200Model
    .find({ rootId, createdAt: { $gte: start, $lt: end } })
    .sort({ createdAt: -1 })
    .lean<PelletBoilerPelux200Entry[]>();

// Ustawiony w aplikacji odstęp odpytywania kotła; domyślny, gdy brak w properties.
export async function getPollIntervalSeconds(rootId: string): Promise<number> {
  const device = await DeviceModel.findById(rootId).select('properties').lean();
  return device?.properties?.poll_interval_seconds ?? DEFAULT_POLL_INTERVAL_SECONDS;
}
