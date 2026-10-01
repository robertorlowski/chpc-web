// Endpointy urządzeń wspólne dla wszystkich rodzajów: lista i wybór w kliencie
// (/devices), zgłoszenie sterownika (/devices/register), nazwa, sterownik domyślny
// i ustawienia (/device/properties). Logika w services/device.service.ts.
import { Request, Response } from 'express';
import { DeviceProperties, DeviceType } from '../types';
import { DeviceDocument } from '../models/device.model';
import {
  createDevice, getDeviceProperties, listDevices, registerDevice, setDefaultDevice,
  updateDeviceName, updateDeviceProperties,
} from '../services/device.service';
import { getDeviceTypeModule } from '../device-types';
import { getFirmwareOffer } from '../services/firmware.service';
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
// wysłać komplet, bo pominięte klucze znikną. Pompa: od najbliższego przebiegu
// schedulera; hydrofor: od następnego zgłoszenia, czyli uruchomienia pompy.
export async function updateProperties(req: Request<{}, {}, DeviceProperties>, res: Response) {
  try {
    const rootId = req.deviceRootId as string;
    const properties = await updateDeviceProperties(rootId, req.body);
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

// Zgłoszenie sterownika: rootId i (hydrofor) ustawienia do zapisania w sterowniku.
// Sterownik woła je przy każdym starcie; 201 = nowe urządzenie, 200 = znane.
// Brak deviceType oznacza pompę ciepła. Oferta firmware (OTA) dla rodzajów z firmwareUpdates.
// Pole version (wersja firmware, najwyżej 32 znaki) jest zapisywane w firmwareVersion.
export async function registerDeviceEntry(
  req: Request<{}, {}, { deviceType?: DeviceType; deviceId?: string; name?: string; version?: string }>,
  res: Response,
) {
  const { deviceType = DeviceType.HP, deviceId, name, version } = req.body;

  if (!deviceId?.trim()) {
    return res.status(400).json({ message: 'deviceId jest wymagane.' });
  }
  if (!Object.values(DeviceType).includes(deviceType)) {
    return res.status(400).json({ message: `Nieznany typ urządzenia: ${deviceType}` });
  }

  try {
    const { device, created } = await registerDevice(
      deviceType, deviceId.trim(), optionalText(name), optionalText(version)?.slice(0, 32),
    );
    // oferta firmware (OTA) tylko dla rodzajów, które ją obsługują i gdy jest włączona
    const firmware = getDeviceTypeModule(device.deviceType).firmwareUpdates
      ? await getFirmwareOffer(device.deviceType, serverBaseUrl(req))
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

// Zmiana nazwy sterownika z listy urządzeń; rootId i deviceId nie podlegają edycji.
// Pusta nazwa jest dozwolona (klient pokazuje wtedy deviceId).
export async function updateDevice(
  req: Request<{ rootId: string }, {}, { name?: string }>,
  res: Response,
) {
  if (typeof req.body.name !== 'string') {
    return res.status(400).json({ message: 'name jest wymagane.' });
  }

  try {
    const device = await updateDeviceName(req.params.rootId, req.body.name.trim());
    return res.status(200).json(toPublicDevice(device));
  } catch (error) {
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
