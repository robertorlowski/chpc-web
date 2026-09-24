import { NextFunction, Request, Response } from 'express';
import { DeviceModel } from '../models/model';
import { getDefaultDeviceRootId } from '../services/device.service';

const publicPaths = new Set(['/devices', '/devices/register']);

export async function resolveDeviceContext(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (publicPaths.has(req.path)) return next();

  let rootId = typeof req.query.rootId === 'string' ? req.query.rootId : '';
  if (!rootId) {
    const usesDefaultDevice =
      req.path === '/hp/add' ||
      req.path === '/operation' ||
      req.path.startsWith('/operation/') ||
      req.path === '/settings' ||
      req.path.startsWith('/settings/');

    if (usesDefaultDevice) {
      rootId = await getDefaultDeviceRootId();
    } else {
      return res.status(400).json({ message: 'rootId jest wymagane.' });
    }
  }
  try {
    const device = await DeviceModel.findById(rootId).select('_id').lean();

    if (!device) {
      return res.status(404).json({ message: 'Nie znaleziono urządzenia.' });
    }

    req.deviceRootId = String(device._id);
    return next();
  } catch {
    return res.status(400).json({ message: 'Nieprawidłowy rootId.' });
  }
}
