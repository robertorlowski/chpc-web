
// Operacje na kolekcji devices dla device.controller: tworzenie, zgłoszenie
// sterownika, nazwa, sterownik domyślny i ustawienia (properties).
import { DeviceProperties, DeviceType } from '../types';
import { DeviceDocument, DeviceModel } from '../models/device.model';
import { getDeviceTypeModule } from '../device-types';

// Pola urządzenia widoczne w API (lista, rejestracja, zmiana nazwy).
export const DEVICE_PUBLIC_FIELDS = 'deviceType deviceId name isDefault';

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
// Znane urządzenie nie jest zmieniane (ani nazwa, ani properties).
// Szuka po parze rodzaj + deviceId: ten sam SN zgłoszony z innym rodzajem
// utworzyłby drugie urządzenie.
export async function registerDevice(
  deviceType: DeviceType,
  deviceId: string,
  name?: string,
): Promise<{ device: DeviceDocument; created: boolean }> {
  const existing = await DeviceModel.findOne({ deviceType, deviceId });
  if (existing) return { device: existing, created: false };

  const device = await DeviceModel.create({
    deviceType,
    deviceId,
    name: name ?? '',
    schedules: [],
    properties: initialProperties(deviceType),
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

export async function updateDeviceName(rootId: string, name: string): Promise<DeviceDocument> {
  const device = await DeviceModel.findByIdAndUpdate(
    rootId,
    { $set: { name } },
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
// schematu, np. work_mode = CWU).
export async function updateDeviceProperties(rootId: string, properties: DeviceProperties): Promise<DeviceProperties> {
  const device = await DeviceModel.findByIdAndUpdate(
    rootId,
    { $set: { properties } },
    { new: true, runValidators: true },
  ).select('properties').lean<DeviceDocument>();
  if (!device) throw new Error('Device not found.');
  return device.properties ?? {};
}


