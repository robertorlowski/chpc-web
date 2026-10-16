// Logowanie i dostęp dla każdego żądania /api (konta użytkowników, 2026-10-11; montowane w core/app.ts):
// - authenticate (przed kontekstem urządzenia): token z nagłówka Authorization: Bearer → req.user, req.sessionToken;
// - authorize (po kontekście urządzenia): bez logowania przechodzą tylko /auth/*, endpointy sterowników (bez zmian
//   w firmware), pobranie pliku firmware i wywołania wewnętrzne; reszta wymaga sesji (401), a żądanie z rootId
//   dostępu do sterownika (403; osoba z udostępnieniem: zapisy według zakładek, access.service.ts).
// AUTH_DISABLED=1 wyłącza sprawdzanie (testy starszych modułów; nie ustawiać na produkcji).
import { NextFunction, Request, Response } from 'express';
import { UserEntry } from '../models/user.model';
import { INTERNAL_TOKEN, INTERNAL_TOKEN_HEADER } from '../internal';
import { deviceAccess, DeviceAccess, sharedWriteDenied } from '../services/access.service';
import { sessionFromToken } from '../services/auth.service';

declare global {
  namespace Express {
    interface Request {
      user?: UserEntry;
      sessionToken?: string;
      deviceAccess?: DeviceAccess;
    }
  }
}

export const authDisabled = () => process.env.AUTH_DISABLED === '1';

const bearer = (req: Request) => {
  const header = req.header('authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
};

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = bearer(req);
  if (!token) return next();
  try {
    const found = await sessionFromToken(token);
    if (found) {
      req.user = found.user;
      req.sessionToken = token;
    }
    return next();
  } catch (error) {
    return res.status(500).json({ message: String(error) });
  }
}

// Endpointy sterowników (metoda i ścieżka względem /api): działają jak przed kontami, bez logowania.
const CONTROLLER_ROUTES = new Set([
  'POST /devices/register',
  'POST /hp/add',
  'POST /pv/add',
  'POST /water-pressure-tank/add',
  'PUT /water-pressure-tank/settings',
  'POST /pellet-boiler-pelux200/add',
  'POST /pellet-boiler-pelux200/settings',
  'POST /pellet-boiler-pelux200/alerts',
  'GET /pellet-boiler-pelux200/commands/next',
  'POST /pellet-boiler-pelux200/commands/result',
  'POST /switch/state',
]);

function isPublic(req: Request) {
  if (req.path.startsWith('/auth/')) return true;
  if (CONTROLLER_ROUTES.has(`${req.method} ${req.path}`)) return true;
  // tryb przekaźnika ze strony włącznika (sam deviceId, source: controller)
  if (req.method === 'PUT' && req.path === '/switch/mode' && !req.user && req.body?.source === 'controller') return true;
  // plik firmware dla sterownika (adres z oferty OTA)
  if (req.method === 'GET' && /^\/firmware\/[^/]+\/[^/]+$/.test(req.path)) return true;
  return req.header(INTERNAL_TOKEN_HEADER) === INTERNAL_TOKEN;
}

// Ścieżki bez rootId tylko dla użytkownika systemowego: pliki firmware, zajętość bazy, wzór kafelka, ręczne dodanie urządzenia.
function systemOnly(req: Request) {
  if (req.path.startsWith('/firmware/') && req.method !== 'GET') return true;
  if (req.path === '/devices/db-stats') return true;
  // wzór kafelka jest wspólny dla wszystkich kont (decyzja użytkownika 2026-10-16)
  if (req.path === '/devices/tile-template' && req.method !== 'GET') return true;
  return req.method === 'POST' && req.path === '/devices';
}

export async function authorize(req: Request, res: Response, next: NextFunction) {
  if (authDisabled() || isPublic(req)) return next();
  const user = req.user;
  if (!user) return res.status(401).json({ message: 'Zaloguj się.' });
  if (systemOnly(req) && !user.isSystem) return res.status(403).json({ message: 'Tylko użytkownik systemowy.' });
  if (!req.deviceRootId) return next();
  try {
    const access = await deviceAccess(user, req.deviceRootId);
    if (!access) return res.status(403).json({ message: 'Brak dostępu do tego sterownika.' });
    if (access.role === 'shared') {
      const denied = sharedWriteDenied(req.method, req.path, access.tabs);
      if (denied) return res.status(403).json({ message: denied });
    }
    req.deviceAccess = access;
    return next();
  } catch (error) {
    return res.status(500).json({ message: String(error) });
  }
}
