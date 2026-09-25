import { Request, Response } from 'express';
import { DeviceProperties, DeviceType } from '../middleware/type';
import { createDevice, getDeviceProperties, listDevices, registerDevice, updateDeviceName, updateDeviceProperties } from '../services/device.service';

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
    return res.status(200).json(devices.map((device) => ({
      rootId: String(device._id),
      deviceType: device.deviceType,
      deviceId: device.deviceId,
      name: device.name,
    })));
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
    return res.status(201).json({
      rootId: String(device._id),
      deviceType: device.deviceType,
      deviceId: device.deviceId,
      name: device.name,
    });
  } catch (error) {
    return res.status(400).json({ message: String(error) });
  }
}

export async function registerDeviceEntry(
  req: Request<{}, {}, { deviceType?: DeviceType; deviceId?: string; name?: string }>,
  res: Response,
) {
  const { deviceType = DeviceType.HP, deviceId, name } = req.body;

  if (!deviceId?.trim()) {
    return res.status(400).json({ message: 'deviceId jest wymagane.' });
  }

  try {
    const { device, created } = await registerDevice(deviceType, deviceId.trim(), name?.trim());
    return res.status(created ? 201 : 200).json({
      rootId: String(device._id),
      deviceType: device.deviceType,
      deviceId: device.deviceId,
      name: device.name,
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
    return res.status(200).json({
      rootId: String(device._id),
      deviceType: device.deviceType,
      deviceId: device.deviceId,
      name: device.name,
    });
  } catch (error) {
    return res.status(String(error).includes('not found') ? 404 : 400).json({ message: String(error) });
  }
}
