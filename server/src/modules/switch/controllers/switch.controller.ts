// Endpointy włącznika (/switch/...): zgłoszenie stanu przez sterownik, tryb przekaźnika
// (aplikacja i strona sterownika), lista przekaźników, nazwy, harmonogramy i włączenia.
// Logika w services/switch.service.ts i services/switch-schedule.service.ts.
import { Request, Response } from 'express';
import { sendMessage } from '../../../core/websocket';
import { getDeviceInfo } from '../../../core/services/device-info.service';
import { warsawDayBoundsUTC } from '../../../core/time';
import { firmwareOfferForRoot } from '../../../core/services/firmware.service';
import { serverBaseUrl } from '../../../core/controllers/firmware.controller';
import {
  listActivations, listRelays, parseStateReport, relayCount, renameRelay, reportState, setRelayMode,
} from '../services/switch.service';
import {
  createSchedule, listSchedules, parseSchedule, removeSchedule, replaceSchedule,
} from '../services/switch-schedule.service';

// Sterownik dostaje polecenia w odpowiedzi na najbliższe zgłoszenie; "operation" budzi
// go od razu (WebSocket), a aplikacja odświeża widok.
const wakeController = (rootId: string) => void sendMessage('operation', rootId);

const handleError = (res: Response, error: unknown) => {
  console.error(error);
  return res.status(500).json({ message: String(error) });
};

// POST /switch/state {uptimeS?, relays: [{on, changedS}]} → {relays: [{on, offAfterS?}], firmware?}
// firmware: oferta OTA tylko przy zleceniu „Aktualizuj” z aplikacji (core/services/firmware.service.ts).
export async function postSwitchState(req: Request, res: Response) {
  const report = parseStateReport(req.body);
  if (!report) return res.status(400).json({ message: 'Nieprawidłowy stan przekaźników.' });
  try {
    const rootId = req.deviceRootId as string;
    const { deviceId } = await getDeviceInfo(rootId);
    const { relays, changed } = await reportState(rootId, deviceId, report);
    if (changed) void sendMessage('update', rootId);
    const firmware = await firmwareOfferForRoot(rootId, serverBaseUrl(req));
    return res.status(200).json(firmware ? { relays, firmware } : { relays });
  } catch (error) {
    return handleError(res, error);
  }
}

// PUT /switch/mode {relay, mode, minutes?}. Ze sterownika (?deviceId= bez rootId albo
// source: "controller") zmiana jest zapisywana jako lokalna.
export async function putSwitchMode(req: Request, res: Response) {
  const source = req.body?.source === 'controller' || (!req.query.rootId && req.query.deviceId) ? 'controller' : 'app';
  try {
    const rootId = req.deviceRootId as string;
    const result = await setRelayMode(rootId, req.body ?? {}, source);
    if (typeof result === 'string') return res.status(400).json({ message: result });
    wakeController(rootId);
    return res.status(200).json((await listRelays(rootId)).find((relay) => relay.relay === result.relay));
  } catch (error) {
    return handleError(res, error);
  }
}

// GET /switch/relays — przekaźniki dla aplikacji: stan ze sterownika, tryb, koniec włączenia,
// wpis harmonogramu działający teraz, najbliższe włączenie i online (zgłoszenie w ciągu 5 min).
export async function getSwitchRelays(req: Request, res: Response) {
  try {
    return res.status(200).json(await listRelays(req.deviceRootId as string));
  } catch (error) {
    return handleError(res, error);
  }
}

// PUT /switch/relays/:relay {name} — nazwa przekaźnika (najwyżej 40 znaków, może być pusta).
export async function putSwitchRelayName(req: Request<{ relay: string }>, res: Response) {
  const name = req.body?.name;
  if (typeof name !== 'string' || name.trim().length > 40) {
    return res.status(400).json({ message: 'name: najwyżej 40 znaków.' });
  }
  try {
    const relay = await renameRelay(req.deviceRootId as string, Number(req.params.relay), name.trim());
    return relay ? res.status(200).json(relay) : res.status(404).json({ message: 'Nie ma takiego przekaźnika.' });
  } catch (error) {
    return handleError(res, error);
  }
}

// Harmonogramy wszystkich przekaźników sterownika. Zapis, zmiana i usunięcie budzą sterownik
// (WebSocket "operation"), żeby nowe okno zadziałało od razu, a nie po 5 s.
export async function getSwitchSchedules(req: Request, res: Response) {
  try {
    return res.status(200).json(await listSchedules(req.deviceRootId as string));
  } catch (error) {
    return handleError(res, error);
  }
}

// POST /switch/schedules {relay, dayOfWeek | date, startTime, endTime, enabled?}
export async function postSwitchSchedule(req: Request, res: Response) {
  try {
    const rootId = req.deviceRootId as string;
    const schedule = parseSchedule(req.body, await relayCount(rootId));
    if (typeof schedule === 'string') return res.status(400).json({ message: schedule });
    const created = await createSchedule(rootId, schedule);
    wakeController(rootId);
    return res.status(201).json(created);
  } catch (error) {
    return handleError(res, error);
  }
}

// PUT /switch/schedules/:id — pełna podmiana wpisu (pola jak przy tworzeniu).
export async function putSwitchSchedule(req: Request<{ id: string }>, res: Response) {
  try {
    const rootId = req.deviceRootId as string;
    const schedule = parseSchedule(req.body, await relayCount(rootId));
    if (typeof schedule === 'string') return res.status(400).json({ message: schedule });
    const updated = await replaceSchedule(rootId, req.params.id, schedule);
    if (!updated) return res.status(404).json({ message: 'Nie znaleziono harmonogramu.' });
    wakeController(rootId);
    return res.status(200).json(updated);
  } catch {
    return res.status(400).json({ message: 'Nieprawidłowy identyfikator harmonogramu.' });
  }
}

// DELETE /switch/schedules/:id
export async function deleteSwitchSchedule(req: Request<{ id: string }>, res: Response) {
  try {
    const rootId = req.deviceRootId as string;
    const deleted = await removeSchedule(rootId, req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Nie znaleziono harmonogramu.' });
    wakeController(rootId);
    return res.status(200).json({});
  } catch {
    return res.status(400).json({ message: 'Nieprawidłowy identyfikator harmonogramu.' });
  }
}

// GET /switch/activations?date=YYYY-MM-DD[&relay=N] — włączenia w dniu (Warszawa),
// także zaczęte dzień wcześniej i trwające; durationS liczone do teraz dla trwających.
export async function getSwitchActivations(req: Request, res: Response) {
  const { date, relay } = req.query;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ message: 'Podaj date=YYYY-MM-DD.' });
  }
  const relayNumber = relay === undefined ? undefined : Number(relay);
  if (relayNumber !== undefined && (!Number.isInteger(relayNumber) || relayNumber < 1)) {
    return res.status(400).json({ message: 'relay: numer przekaźnika.' });
  }
  try {
    const { startUTC, endUTC } = warsawDayBoundsUTC(date);
    return res.status(200).json(await listActivations(req.deviceRootId as string, startUTC, endUTC, relayNumber));
  } catch (error) {
    return handleError(res, error);
  }
}
