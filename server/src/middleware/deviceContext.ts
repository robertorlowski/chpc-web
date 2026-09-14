import { NextFunction, Request, Response } from 'express';
import { DeviceModel } from '../models/model';
import { getDefaultDeviceRootId } from '../services/device.service';

const publicPaths = new Set(['/devices']);

export async function resolveDeviceContext(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (publicPaths.has(req.path)) return next();

  let rootId = typeof req.query.rootId === 'string' ? req.query.rootId : '';
  const deviceId = typeof req.query.deviceId === 'string' ? req.query.deviceId : '';
  if (!rootId) {
    if (req.path === '/hp/add') {
      rootId = await getDefaultDeviceRootId();
    } else {
      return res.status(400).json({ message: 'rootId jest wymagane.' });
    }
  }
  if (!deviceId) {
    return res.status(400).json({ message: 'deviceId jest wymagane.' });
  }

  try {
    const device = await DeviceModel.findById(rootId)
      .select('_id deviceType deviceId')
      .lean();

    if (!device) {
      return res.status(404).json({ message: 'Nie znaleziono urządzenia.' });
    }
    if (device.deviceId !== deviceId) {
      return res.status(400).json({ message: 'rootId i deviceId wskazują różne urządzenia.' });
    }

    req.deviceRootId = String(device._id);
    return next();
  } catch {
    return res.status(400).json({ message: 'Nieprawidłowy rootId.' });
  }
}
