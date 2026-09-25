import { NextFunction, Request, Response } from 'express';
import { DeviceModel } from '../models/model';

const publicPaths = new Set(['/devices', '/devices/register']);

export async function resolveDeviceContext(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  // PUT /devices/:rootId niesie identyfikator w ścieżce, nie w query string
  if (publicPaths.has(req.path) || req.path.startsWith('/devices/')) return next();

  // Nie ma urządzenia domyślnego: dawne "hp-1" tworzyło się samo przy żądaniu bez rootId.
  const rootId = typeof req.query.rootId === 'string' ? req.query.rootId : '';
  if (!rootId) {
    return res.status(400).json({ message: 'rootId jest wymagane.' });
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
