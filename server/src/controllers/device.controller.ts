import { Request, Response } from 'express';
import { DeviceType } from '../middleware/type';
import { createDevice, listDevices } from '../services/device.service';

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