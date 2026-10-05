
// Operacje na kolekcji devices dla device.controller: tworzenie, zgłoszenie
// sterownika, nazwa, definicja pompy, sterownik domyślny i ustawienia (properties).
import { DeviceProperties, DeviceType, PumpConfig } from '../types';
import { DeviceDocument, DeviceModel } from '../models/device.model';
import { getDeviceTypeModule } from '../device-types';

// Pola urządzenia widoczne w API (lista, rejestracja, zmiana nazwy).
export const DEVICE_PUBLIC_FIELDS = 'deviceType deviceId name isDefault firmwareVersion firmwareSeenAt firmwareUpdate ipAddress ipSeenAt pumpConfig';

// Pojemność zbiornika pompy [l], pełne litry.
const TANK_LITERS_MIN = 20;
const TANK_LITERS_MAX = 2000;

// Definicja pompy z okna „Dane sterownika”: komplet pól, wymuszenie PV tylko z DTU.
export function parsePumpConfig(value: unknown): PumpConfig {
  const config = (value ?? {}) as Record<string, unknown>;
  if (config.connection !== 'cwu' && config.connection !== 'co') {
    throw new Error('pumpConfig.connection: cwu albo co.');
  }
  const tankLiters = config.tankLiters;
  if (typeof tankLiters !== 'number' || !Number.isInteger(tankLiters)
    || tankLiters < TANK_LITERS_MIN || tankLiters > TANK_LITERS_MAX) {
    throw new Error(`pumpConfig.tankLiters: pełne litry ${TANK_LITERS_MIN}–${TANK_LITERS_MAX}.`);
  }
  if (typeof config.pvDtu !== 'boolean' || typeof config.pvForce !== 'boolean') {
    throw new Error('pumpConfig.pvDtu i pumpConfig.pvForce: true albo false.');
  }
  return { connection: config.connection, tankLiters, pvDtu: config.pvDtu, pvForce: config.pvDtu && config.pvForce };
}

const initialProperties = (deviceType: DeviceType) => getDeviceTypeModule(deviceType).initialProperties;

// POST /devices (ręcznie, test E2E). W odróżnieniu od registerDevice nadaje
// nazwę równą deviceId i nie ustawia properties rodzaju sterownika.
export async function createDevice(
  deviceType: DeviceType,
  deviceId: string,
  name?: string
): Promise<DeviceDocument> {  
  const existing = await DeviceModel.findOne({ deviceType, deviceId });
  if (existing) throw new Error('Device already exists.');

  return DeviceModel.create({
    deviceType,
    deviceId,
    name: name || deviceId,
    schedules: [],
  });
}

// Znany sterownik dostaje swój rekord z powrotem, nowy zostaje utworzony.
// Nazwa ze zgłoszenia trafia tylko do nowego urządzenia; później nadaje ją użytkownik.
// Znane urządzenie nie jest zmieniane (ani nazwa, ani properties); wyjątek to wersja
// firmware (firmwareVersion) i adres IP (ipAddress), odświeżane przy każdym zgłoszeniu,
// które je niesie. Szuka po parze rodzaj + deviceId: ten sam SN zgłoszony z innym
// rodzajem utworzyłby drugie urządzenie.
export async function registerDevice(
  deviceType: DeviceType,
  deviceId: string,
  name?: string,
  firmwareVersion?: string,
  ipAddress?: string,
): Promise<{ device: DeviceDocument; created: boolean }> {
  const now = new Date();
  const seen = {
    ...(firmwareVersion ? { firmwareVersion, firmwareSeenAt: now } : {}),
    ...(ipAddress ? { ipAddress, ipSeenAt: now } : {}),
  };
  const existing = await DeviceModel.findOne({ deviceType, deviceId });
  if (existing) {
    if (Object.keys(seen).length > 0) {
      existing.set(seen);
      await existing.save();
    }
    return { device: existing, created: false };
  }

  const device = await DeviceModel.create({
    deviceType,
    deviceId,
    name: name ?? '',
    schedules: [],
    properties: initialProperties(deviceType),
    ...seen,
  });
  return { device, created: true };
}

// Najwyżej jeden sterownik domyślny: ustawienie zdejmuje znacznik z pozostałych.
export async function setDefaultDevice(rootId: string, isDefault: boolean): Promise<DeviceDocument> {
  const device = await DeviceModel.findById(rootId).select('_id');
  if (!device) throw new Error('Device not found.');
  if (isDefault) await DeviceModel.updateMany({ _id: { $ne: device._id } }, { $set: { isDefault: false } });
  const updated = await DeviceModel.findByIdAndUpdate(rootId, { $set: { isDefault } }, { new: true })
    .select(DEVICE_PUBLIC_FIELDS).lean<DeviceDocument>();
  return updated as DeviceDocument;
}

// Okno „Dane sterownika”: nazwa i (tylko pompa ciepła) definicja pompy.
export async function updateDeviceData(
  rootId: string,
  data: { name?: string; pumpConfig?: PumpConfig },
): Promise<DeviceDocument> {
  if (data.pumpConfig) {
    const existing = await DeviceModel.findById(rootId).select('deviceType').lean<DeviceDocument>();
    if (!existing) throw new Error('Device not found.');
    if (existing.deviceType !== DeviceType.HP) throw new Error('pumpConfig: tylko pompa ciepła.');
  }
  const device = await DeviceModel.findByIdAndUpdate(
    rootId,
    { $set: data },
    { new: true, runValidators: true },
  ).select(DEVICE_PUBLIC_FIELDS).lean<DeviceDocument>();
  if (!device) throw new Error('Device not found.');
  return device;
}

export async function listDevices(): Promise<DeviceDocument[]> {
  return DeviceModel.find()
    .select(DEVICE_PUBLIC_FIELDS)
    .sort({ name: 1 })
    .lean<DeviceDocument[]>();
}

export async function getDeviceProperties(rootId: string): Promise<DeviceProperties> {
  const device = await DeviceModel.findById(rootId).select('properties').lean<DeviceDocument>();
  if (!device) throw new Error('Device not found.');
  return device.properties ?? {};
}

// $set całego properties: pominięte klucze znikają (poza wartościami domyślnymi
// schematu, np. work_mode = MANUAL).
export async function updateDeviceProperties(rootId: string, properties: DeviceProperties): Promise<DeviceProperties> {
  const device = await DeviceModel.findByIdAndUpdate(
    rootId,
    { $set: { properties } },
    { new: true, runValidators: true },
  ).select('properties').lean<DeviceDocument>();
  if (!device) throw new Error('Device not found.');
  return device.properties ?? {};
}


