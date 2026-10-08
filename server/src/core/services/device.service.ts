
// Operacje na kolekcji devices dla device.controller: tworzenie, zgłoszenie
// sterownika, nazwa, definicja pompy, sterownik domyślny i ustawienia (properties).
import { BoilerConfig, DeviceProperties, DeviceType, PumpConfig } from '../types';
import { DeviceDocument, DeviceModel } from '../models/device.model';
import { getDeviceTypeModule } from '../device-types';

// Pola urządzenia widoczne w API (lista, rejestracja, zmiana nazwy).
export const DEVICE_PUBLIC_FIELDS = 'deviceType deviceId name isDefault sortOrder firmwareVersion firmwareSeenAt firmwareUpdate ipAddress ipSeenAt pumpConfig boilerConfig';

// Pojemność zbiornika pompy [l], pełne litry.
const TANK_LITERS_MIN = 20;
const TANK_LITERS_MAX = 2000;

// Definicja pompy z okna „Dane sterownika”: komplet pól, wymuszenie PV tylko z DTU.
export function parsePumpConfig(value: unknown): PumpConfig {
  const config = (value ?? {}) as Record<string, unknown>;
  if (config.connection !== 'cwu' && config.connection !== 'co') {
    throw new Error('pumpConfig.connection: cwu albo co.');
  }
  // pojemność jest opcjonalna (pusta, dopóki użytkownik jej nie wpisze); wpisana musi być pełnymi litrami w zakresie
  const tankLiters = config.tankLiters === null ? undefined : config.tankLiters;
  if (tankLiters !== undefined && (typeof tankLiters !== 'number' || !Number.isInteger(tankLiters)
    || tankLiters < TANK_LITERS_MIN || tankLiters > TANK_LITERS_MAX)) {
    throw new Error(`pumpConfig.tankLiters: pełne litry ${TANK_LITERS_MIN}–${TANK_LITERS_MAX} albo puste.`);
  }
  if (typeof config.pvDtu !== 'boolean' || typeof config.pvForce !== 'boolean') {
    throw new Error('pumpConfig.pvDtu i pumpConfig.pvForce: true albo false.');
  }
  return {
    connection: config.connection,
    ...(tankLiters !== undefined ? { tankLiters } : {}),
    pvDtu: config.pvDtu,
    pvForce: config.pvDtu && config.pvForce,
  };
}

// Definicja kotła z okna „Dane sterownika”: Root ID istniejącej pompy ciepła albo null (bez pompy),
// połączenie z kotłem (rs485 / econet300) i adres IPv4 modułu ecoNET300 (wymagany przy econet300).
const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
export async function parseBoilerConfig(value: unknown): Promise<BoilerConfig> {
  const config = (value ?? {}) as Record<string, unknown>;
  const heatPumpRootId = config.heatPumpRootId ?? null;
  if (heatPumpRootId !== null && (typeof heatPumpRootId !== 'string' || !/^[0-9a-f]{24}$/i.test(heatPumpRootId)
    || !(await DeviceModel.exists({ _id: heatPumpRootId, deviceType: DeviceType.HP })))) {
    throw new Error('boilerConfig.heatPumpRootId: Root ID pompy ciepła albo null.');
  }
  const connection = config.connection ?? 'rs485';
  if (connection !== 'rs485' && connection !== 'econet300') throw new Error('boilerConfig.connection: rs485 albo econet300.');
  const econetIp = typeof config.econetIp === 'string' && config.econetIp.trim() ? config.econetIp.trim() : null;
  if (econetIp !== null && !IPV4.test(econetIp)) throw new Error('boilerConfig.econetIp: adres IPv4.');
  if (connection === 'econet300' && !econetIp) throw new Error('boilerConfig.econetIp: wymagany przy połączeniu ecoNET300.');
  return { heatPumpRootId: heatPumpRootId as string | null, connection, econetIp };
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
  // definicja nadawana automatycznie przy zgłoszeniu (pompa ciepła: podłączenie CWU, bez pojemności zbiornika)
  const initialPumpConfig = getDeviceTypeModule(deviceType).initialPumpConfig;
  const existing = await DeviceModel.findOne({ deviceType, deviceId });
  if (existing) {
    const missingPumpConfig = initialPumpConfig && !existing.pumpConfig;
    if (Object.keys(seen).length > 0 || missingPumpConfig) {
      existing.set({ ...seen, ...(missingPumpConfig ? { pumpConfig: initialPumpConfig } : {}) });
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
    ...(initialPumpConfig ? { pumpConfig: initialPumpConfig } : {}),
    ...seen,
  });
  return { device, created: true };
}

// Pompy ciepła zgłoszone, zanim definicja była nadawana automatycznie (albo bez zapisanej): dostają tę samą definicję
// startową; istniejącej definicji nie rusza. Wołane przy starcie serwera (server.ts).
export async function assignDefaultPumpConfigs(): Promise<number> {
  const initial = getDeviceTypeModule(DeviceType.HP).initialPumpConfig;
  if (!initial) return 0;
  const result = await DeviceModel.updateMany(
    { deviceType: DeviceType.HP, $or: [{ pumpConfig: { $exists: false } }, { pumpConfig: null }] },
    { $set: { pumpConfig: initial } },
  );
  return result.modifiedCount;
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
  data: { name?: string; pumpConfig?: PumpConfig; boilerConfig?: BoilerConfig },
): Promise<DeviceDocument> {
  if (data.pumpConfig || data.boilerConfig) {
    const existing = await DeviceModel.findById(rootId).select('deviceType').lean<DeviceDocument>();
    if (!existing) throw new Error('Device not found.');
    if (data.pumpConfig && existing.deviceType !== DeviceType.HP) throw new Error('pumpConfig: tylko pompa ciepła.');
    if (data.boilerConfig) {
      if (existing.deviceType !== DeviceType.PELLET_BOILER_PELUX200) throw new Error('boilerConfig: tylko kocioł pelletowy.');
      await getDeviceTypeModule(existing.deviceType).checkDefinition?.(rootId, { boilerConfig: data.boilerConfig });
    }
  }
  const device = await DeviceModel.findByIdAndUpdate(
    rootId,
    { $set: data },
    { new: true, runValidators: true },
  ).select(DEVICE_PUBLIC_FIELDS).lean<DeviceDocument>();
  if (!device) throw new Error('Device not found.');
  return device;
}

// Lista dla /devices: najpierw sterowniki z ustawioną kolejnością (sortOrder rosnąco), potem pozostałe po nazwie.
export async function listDevices(): Promise<DeviceDocument[]> {
  const devices = await DeviceModel.find()
    .select(DEVICE_PUBLIC_FIELDS)
    .sort({ name: 1 })
    .lean<DeviceDocument[]>();
  const rank = (device: DeviceDocument) => device.sortOrder ?? Number.MAX_SAFE_INTEGER;
  return devices.sort((a, b) => rank(a) - rank(b)); // sort jest stabilny: bez sortOrder zostaje kolejność po nazwie
}

// Tryb „Zmień kolejność” na /devices: rootIds w nowej kolejności (każdy sterownik dokładnie raz).
// Zapisuje sortOrder = miejsce na liście, więc kolejność jest wspólna dla wszystkich przeglądarek.
export async function setDevicesOrder(rootIds: unknown): Promise<void> {
  if (!Array.isArray(rootIds) || rootIds.some((id) => typeof id !== 'string' || !/^[0-9a-f]{24}$/i.test(id))
    || new Set(rootIds).size !== rootIds.length) {
    throw new Error('rootIds: lista unikalnych Root ID.');
  }
  const existing = await DeviceModel.countDocuments({ _id: { $in: rootIds } });
  if (existing !== rootIds.length) throw new Error('rootIds: nieznany sterownik (Device not found).');
  await DeviceModel.bulkWrite((rootIds as string[]).map((id, index) => ({
    updateOne: { filter: { _id: id }, update: { $set: { sortOrder: index } } },
  })));
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


