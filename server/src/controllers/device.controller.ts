import { Request, Response } from 'express';
import { DeviceProperties, DeviceType } from '../middleware/type';
import { DeviceDocument } from '../models/model';
import {
  createDevice, getDeviceProperties, listDevices, registerDevice, setDefaultDevice,
  updateDeviceName, updateDeviceProperties,
} from '../services/device.service';

const toPublicDevice = (device: DeviceDocument) => ({
  rootId: String(device._id),
  deviceType: device.deviceType,
  deviceId: device.deviceId,
  name: device.name,
  isDefault: device.isDefault ?? false,
});

// Ustawienia, które sterownik hydroforu pobiera raz na start (odpowiedź na zgłoszenie).
const controllerSettings = (device: DeviceDocument) => {
  if (device.deviceType !== DeviceType.WATER_PRESSURE) return undefined;
  const properties = device.properties ?? {};
  return {
    compressor_seconds: properties.compressor_seconds,
    pressure_low: properties.pressure_low,
    pressure_high: properties.pressure_high,
    tanks: properties.tanks ?? [],
  };
};

export async function getProperties(req: Request, res: Response) {
  try {
    return res.status(200).json(await getDeviceProperties(req.deviceRootId as string));
  } catch (error) {
    return res.status(404).json({ message: String(error) });
  }
}

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
export async function registerDeviceEntry(
  req: Request<{}, {}, { deviceType?: DeviceType; deviceId?: string; name?: string }>,
  res: Response,
) {
  const { deviceType = DeviceType.HP, deviceId, name } = req.body;

  if (!deviceId?.trim()) {
    return res.status(400).json({ message: 'deviceId jest wymagane.' });
  }
  if (!Object.values(DeviceType).includes(deviceType)) {
    return res.status(400).json({ message: `Nieznany typ urządzenia: ${deviceType}` });
  }

  try {
    const { device, created } = await registerDevice(deviceType, deviceId.trim(), optionalText(name));
    return res.status(created ? 201 : 200).json({
      ...toPublicDevice(device),
      settings: controllerSettings(device),
    });
  } catch (error) {
    return res.status(400).json({ message: String(error) });
  }
}

// Zmiana nazwy sterownika z listy urządzeń; rootId i deviceId nie podlegają edycji.
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
