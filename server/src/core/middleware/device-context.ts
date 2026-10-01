// Kontekst urządzenia dla każdego żądania /api (montowany w core/app.ts):
// z ?rootId= (albo ?deviceId= dla endpointów sterownika) ustala req.deviceRootId,
// z którego korzystają wszystkie kontrolery. 400 bez identyfikatora, 404 dla
// nieznanego urządzenia, 409 gdy rootId sterownika należy do innego deviceId.
import { NextFunction, Request, Response } from 'express';
import { DeviceModel } from '../models/device.model';
import { DeviceType } from '../types';

// ścieżki względem /api (req.path w routerze montowanym pod /api)
const publicPaths = new Set(['/devices', '/devices/register']);

// Endpointy sterownika: urządzenie wskazuje rootId albo sam deviceId (SN),
// więc sterownik bez zapisanego rootId też może wysyłać dane. Ten sam SN może
// być zarejestrowany pod kilkoma rodzajami sterownika (różne role jednego
// fizycznego urządzenia, różny rootId), więc każdy endpoint musi wiedzieć,
// jakiego rodzaju szuka.
const controllerPaths = new Map<string, DeviceType>([
  ['/hp/add', DeviceType.HP],
  ['/pv/add', DeviceType.HP],
  ['/water-pressure-tank/add', DeviceType.WATER_PRESSURE_TANK],
  ['/water-pressure-tank/settings', DeviceType.WATER_PRESSURE_TANK],
  ['/pellet-boiler-pelux200/add', DeviceType.PELLET_BOILER_PELUX200],
]);

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
  const expectedType = controllerPaths.get(req.path);
  const fromController = expectedType !== undefined;

  // Nie ma urządzenia domyślnego: dawne "hp-1" tworzyło się samo przy żądaniu bez rootId.
  if (!rootId && !(fromController && deviceId)) {
    return res.status(400).json({ message: 'rootId jest wymagane.' });
  }
  try {
    const device = rootId
      ? await DeviceModel.findById(rootId).select('_id deviceId deviceType').lean()
      // ten sam SN może mieć osobne dokumenty dla różnych rodzajów sterownika,
      // więc szukanie po samym deviceId musi być zawężone do rodzaju endpointu
      : await DeviceModel.findOne({ deviceId, deviceType: expectedType }).select('_id deviceId deviceType').lean();

    if (!device) {
      return res.status(404).json({ message: 'Nie znaleziono urządzenia.' });
    }

    // rootId zapisany w sterowniku należy do innego urządzenia (np. po
    // wyczyszczeniu bazy albo pomyłce rodzaju) — sterownik rejestruje się wtedy ponownie.
    if (fromController && rootId && (
      (deviceId && device.deviceId !== deviceId) || device.deviceType !== expectedType
    )) {
      return res.status(409).json({ message: 'rootId nie należy do tego deviceId.' });
    }

    req.deviceRootId = String(device._id);
    return next();
  } catch {
    // findById rzuca CastError dla rootId, który nie jest ObjectId
    return res.status(400).json({ message: 'Nieprawidłowy rootId.' });
  }
}

declare global {
  namespace Express {
    interface Request {
      deviceRootId?: string;
    }
  }
}
