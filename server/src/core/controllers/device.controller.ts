// Endpointy urządzeń wspólne dla wszystkich rodzajów: lista i wybór w kliencie
// (/devices), zgłoszenie sterownika (/devices/register), nazwa, sterownik domyślny
// i ustawienia (/device/properties). Logika w services/device.service.ts.
import { Request, Response } from 'express';
import { DefinitionConflictError, DeviceProperties, DeviceType } from '../types';
import { DeviceDocument } from '../models/device.model';
import {
  createDevice, getDeviceProperties, listDevices, parseBoilerConfig, parsePumpConfig, registerDevice, setDefaultDevice,
  updateDeviceData, updateDeviceProperties,
} from '../services/device.service';
import { getDeviceTypeModule } from '../device-types';
import { getDeviceInfo } from '../services/device-info.service';
import {
  FirmwareError, cancelFirmwareUpdate, firmwareOfferForDevice, requestFirmwareUpdate,
} from '../services/firmware.service';
import { sendMessage } from '../websocket';
import { serverBaseUrl } from './firmware.controller';

// Kształt urządzenia w API; rootId to _id dokumentu w kolekcji devices.
const toPublicDevice = (device: DeviceDocument) => ({
  rootId: String(device._id),
  deviceType: device.deviceType,
  deviceId: device.deviceId,
  name: device.name,
  isDefault: device.isDefault ?? false,
  firmwareVersion: device.firmwareVersion,
  firmwareSeenAt: device.firmwareSeenAt,
  firmwareUpdate: device.firmwareUpdate ?? undefined,
  ipAddress: device.ipAddress,
  ipSeenAt: device.ipSeenAt,
  pumpConfig: device.pumpConfig ?? undefined,
  boilerConfig: device.boilerConfig ?? undefined,
});

// Ustawienia, które sterownik pobiera w odpowiedzi na zgłoszenie (tylko rodzaje, które je mają).
const controllerSettings = (device: DeviceDocument) =>
  getDeviceTypeModule(device.deviceType).controllerSettings?.(device.properties ?? {});

export async function getProperties(req: Request, res: Response) {
  try {
    return res.status(200).json(await getDeviceProperties(req.deviceRootId as string));
  } catch (error) {
    return res.status(404).json({ message: String(error) });
  }
}

// Zapis zastępuje całe properties (wszystkie rodzaje w jednym polu): klient musi
// wysłać komplet, bo pominięte klucze znikną. Pompa: od razu, ręczne ustawienia znikają
// (onPropertiesSaved); hydrofor: od następnego zgłoszenia, czyli uruchomienia pompy.
export async function updateProperties(req: Request<{}, {}, DeviceProperties>, res: Response) {
  try {
    const rootId = req.deviceRootId as string;
    const properties = await updateDeviceProperties(rootId, req.body);
    const { deviceType } = await getDeviceInfo(rootId);
    await getDeviceTypeModule(deviceType).onPropertiesSaved?.(rootId);
    return res.status(200).json(properties);
  } catch (error) {
    return res.status(400).json({ message: String(error) });
  }
}

export async function getDevices(_req: Request, res: Response) {
  try {
    const devices = await listDevices();
    return res.status(200).json(devices.map(toPublicDevice));
  } catch (error) {
    return res.status(500).json({ message: String(error) });
  }
}

// POST /devices: ręczne utworzenie (test E2E). Duplikat deviceId = 400.
export async function addDevice(
  req: Request<{}, {}, { deviceType?: DeviceType; deviceId?: string; name?: string }>,
  res: Response,
) {
  const { deviceType = DeviceType.HP, deviceId, name } = req.body;

  if (!deviceId?.trim()) {
    return res.status(400).json({ message: 'deviceId jest wymagane.' });
  }

  try {
    const device = await createDevice(deviceType, deviceId.trim(), name?.trim());
    return res.status(201).json(toPublicDevice(device));
  } catch (error) {
    return res.status(400).json({ message: String(error) });
  }
}

const optionalText = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

// Adres IPv4 w zapisie dziesiętnym (a.b.c.d, 0–255); 0.0.0.0 to brak adresu w ESP32.
const ipv4 = (value: unknown) => {
  const text = optionalText(value);
  if (!text || text === '0.0.0.0') return undefined;
  const parts = text.split('.');
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
    ? text
    : undefined;
};

// Zgłoszenie sterownika: rootId i (hydrofor) ustawienia do zapisania w sterowniku.
// Sterownik woła je przy każdym starcie; 201 = nowe urządzenie, 200 = znane.
// Brak deviceType oznacza pompę ciepła. Oferta firmware (OTA) dla rodzajów z firmwareUpdates.
// Pole version (wersja firmware, najwyżej 32 znaki) jest zapisywane w firmwareVersion,
// a ip (adres IPv4 w sieci lokalnej) w ipAddress; ip w innym formacie jest pomijane.
export async function registerDeviceEntry(
  req: Request<{}, {}, { deviceType?: DeviceType; deviceId?: string; name?: string; version?: string; ip?: string }>,
  res: Response,
) {
  const { deviceType = DeviceType.HP, deviceId, name, version, ip } = req.body;

  if (!deviceId?.trim()) {
    return res.status(400).json({ message: 'deviceId jest wymagane.' });
  }
  if (!Object.values(DeviceType).includes(deviceType)) {
    return res.status(400).json({ message: `Nieznany typ urządzenia: ${deviceType}` });
  }

  try {
    const { device, created } = await registerDevice(
      deviceType, deviceId.trim(), optionalText(name), optionalText(version)?.slice(0, 32), ipv4(ip),
    );
    const typeModule = getDeviceTypeModule(device.deviceType);
    await typeModule.onRegister?.(String(device._id), device.deviceId, req.body as Record<string, unknown>);
    // oferta firmware (OTA) tylko przy zleceniu „Aktualizuj”; zgłoszenie z oferowaną wersją je kasuje
    const firmware = typeModule.firmwareUpdates
      ? await firmwareOfferForDevice(device, serverBaseUrl(req))
      : undefined;
    const settings = controllerSettings(device) as object | undefined;
    return res.status(created ? 201 : 200).json({
      ...toPublicDevice(device),
      settings: firmware ? { ...settings, firmware } : settings,
    });
  } catch (error) {
    return res.status(400).json({ message: String(error) });
  }
}

const firmwareError = (res: Response, error: unknown) =>
  error instanceof FirmwareError
    ? res.status(error.status).json({ message: error.message })
    : res.status(400).json({ message: String(error) });

// POST /devices/:rootId/firmware-update — przycisk „Aktualizuj”: zlecenie aktualizacji do oferowanej
// wersji. Sterownik dostaje ofertę w najbliższej odpowiedzi chmury (piec co 15 s, włącznik co 5 s,
// hydrofor przy następnym uruchomieniu pompy); WebSocket budzi włącznik od razu.
export async function requestDeviceFirmwareUpdate(req: Request<{ rootId: string }>, res: Response) {
  try {
    const firmwareUpdate = await requestFirmwareUpdate(req.params.rootId);
    void sendMessage('operation', req.params.rootId);
    return res.status(200).json(firmwareUpdate);
  } catch (error) {
    return firmwareError(res, error);
  }
}

// DELETE /devices/:rootId/firmware-update — odwołanie zlecenia.
export async function cancelDeviceFirmwareUpdate(req: Request<{ rootId: string }>, res: Response) {
  try {
    await cancelFirmwareUpdate(req.params.rootId);
    return res.status(200).json({});
  } catch (error) {
    return firmwareError(res, error);
  }
}

// Okno „Dane sterownika”: nazwa {name}, dla pompy ciepła definicja {pumpConfig} (komplet pól), dla kotła
// pelletowego {boilerConfig} (powiązana pompa ciepła; 409, gdy moduł odrzuci, np. usunięcie pompy w trybie pompy);
// rootId i deviceId nie podlegają edycji. Pusta nazwa jest dozwolona (klient pokazuje wtedy deviceId).
// Definicja pompy nie zmienia trybu pracy ani temperatur, więc nie budzi schedulera.
export async function updateDevice(
  req: Request<{ rootId: string }, {}, { name?: string; pumpConfig?: unknown; boilerConfig?: unknown }>,
  res: Response,
) {
  const { name, pumpConfig, boilerConfig } = req.body ?? {};
  if (name !== undefined && typeof name !== 'string') {
    return res.status(400).json({ message: 'name: napis.' });
  }
  if (name === undefined && pumpConfig === undefined && boilerConfig === undefined) {
    return res.status(400).json({ message: 'name, pumpConfig albo boilerConfig jest wymagane.' });
  }

  try {
    const device = await updateDeviceData(req.params.rootId, {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(pumpConfig !== undefined ? { pumpConfig: parsePumpConfig(pumpConfig) } : {}),
      ...(boilerConfig !== undefined ? { boilerConfig: await parseBoilerConfig(boilerConfig) } : {}),
    });
    return res.status(200).json(toPublicDevice(device));
  } catch (error) {
    if (error instanceof DefinitionConflictError) return res.status(409).json({ message: error.message });
    return res.status(String(error).includes('not found') ? 404 : 400).json({ message: String(error) });
  }
}

// PUT /devices/:rootId/default {isDefault?: boolean} — domyślnie ustawia.
export async function updateDefaultDevice(
  req: Request<{ rootId: string }, {}, { isDefault?: boolean }>,
  res: Response,
) {
  try {
    const device = await setDefaultDevice(req.params.rootId, req.body?.isDefault !== false);
    return res.status(200).json(toPublicDevice(device));
  } catch (error) {
    return res.status(String(error).includes('not found') ? 404 : 400).json({ message: String(error) });
  }
}
