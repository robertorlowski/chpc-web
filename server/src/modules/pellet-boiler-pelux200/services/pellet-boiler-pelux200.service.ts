// Odczyty kotła Pellux 200: walidacja body sterownika, zapis, ostatni odczyt
// w pamięci per rootId (po restarcie serwera z bazy) i lista z jednego dnia. Czujnik zewnętrzny kotła
// (outside_temp) ustawia temperaturę zewnętrzną serwera (core meteo.service: t_out pompy ciepła).
import { PelletBoilerPelux200Entry, PelletBoilerPelux200Measurements } from '../types';
import { PelletBoilerPelux200Model } from '../models/pellet-boiler-pelux200.model';
import { getDeviceInfo } from '../../../core/services/device-info.service';
import { DeviceModel } from '../../../core/models/device.model';
import { sendMessage } from '../../../core/websocket';
import { setOutdoorTemperature } from '../../../core/services/meteo.service';

export const DEFAULT_POLL_INTERVAL_SECONDS = 300;

const NUMBER_FIELDS = [
  'state', 'heating_temp', 'feeder_temp', 'water_heater_temp', 'outside_temp', 'return_temp',
  'exhaust_temp', 'optical_temp', 'upper_buffer_temp', 'lower_buffer_temp', 'heating_target',
  'water_heater_target', 'heating_status', 'water_heater_status', 'fuel_level', 'fan_power',
  'boiler_load', 'boiler_power', 'fuel_consumption', 'lambda_level',
  'mixer1_temp', 'mixer1_target', 'mixer2_temp', 'mixer2_target',
] as const;
const BOOLEAN_FIELDS = [
  'fan', 'feeder', 'heating_pump', 'water_heater_pump', 'circulation_pump', 'lighter', 'alarm',
  'mixer1_pump', 'mixer1_opening', 'mixer1_closing', 'mixer2_pump', 'mixer2_opening', 'mixer2_closing',
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
  // czujnik zewnętrzny kotła = temperatura zewnętrzna całego serwera (pompa ciepła: t_out, ekran co)
  if (typeof reading.outside_temp === 'number') setOutdoorTemperature(reading.outside_temp, new Date());
  sendMessage('update', rootId);
  return doc;
}

// Po starcie serwera: temperatura zewnętrzna z ostatniego odczytu kotła z czujnikiem (wiek sprawdza core).
export async function restoreOutdoorTemperature() {
  const last = await PelletBoilerPelux200Model
    .findOne({ outside_temp: { $type: 'number' } }).sort({ createdAt: -1 })
    .lean<PelletBoilerPelux200Entry & { createdAt?: Date }>();
  if (typeof last?.outside_temp === 'number' && last.createdAt) setOutdoorTemperature(last.outside_temp, new Date(last.createdAt));
  return last?.outside_temp;
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
