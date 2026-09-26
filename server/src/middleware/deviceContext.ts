import { NextFunction, Request, Response } from 'express';
import { DeviceModel } from '../models/model';

const publicPaths = new Set(['/devices', '/devices/register']);

// Endpointy sterownika: urządzenie wskazuje rootId albo sam deviceId (SN),
// więc sterownik bez zapisanego rootId też może wysyłać dane.
const controllerPaths = new Set(['/hp/add', '/pv/add']);

const queryText = (value: unknown) => typeof value === 'string' ? value.trim() : '';

export async function resolveDeviceContext(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  // PUT /devices/:rootId niesie identyfikator w ścieżce, nie w query string
  if (publicPaths.has(req.path) || req.path.startsWith('/devices/')) return next();

  const rootId = queryText(req.query.rootId);
  const deviceId = queryText(req.query.deviceId);
  const fromController = controllerPaths.has(req.path);

  // Nie ma urządzenia domyślnego: dawne "hp-1" tworzyło się samo przy żądaniu bez rootId.
  if (!rootId && !(fromController && deviceId)) {
    return res.status(400).json({ message: 'rootId jest wymagane.' });
  }
  try {
    const device = rootId
      ? await DeviceModel.findById(rootId).select('_id deviceId').lean()
      : await DeviceModel.findOne({ deviceId }).select('_id deviceId').lean();

    if (!device) {
      return res.status(404).json({ message: 'Nie znaleziono urządzenia.' });
    }

    // rootId zapisany w sterowniku należy do innego urządzenia (np. po
    // wyczyszczeniu bazy); sterownik rejestruje się wtedy ponownie.
    if (fromController && rootId && deviceId && device.deviceId !== deviceId) {
      return res.status(409).json({ message: 'rootId nie należy do tego deviceId.' });
    }

    req.deviceRootId = String(device._id);
    return next();
  } catch {
    return res.status(400).json({ message: 'Nieprawidłowy rootId.' });
  }
}
