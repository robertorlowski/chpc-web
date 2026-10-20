// /api/push/* (powiadomienia Web Push, 2026-10-21; karta „Powiadomienia” w /account): ustawienia konta
// (klucz publiczny VAPID, subskrypcje, reguły, katalog zdarzeń i sterowniki do wyboru), zapis i usunięcie
// subskrypcji przeglądarki, reguły z ciszą nocną, powiadomienie próbne. Bez rootId; wymaga zalogowania
// (core/middleware/session.ts), a wywołania bez logowania zatrzymuje authorize (401).
import { Request, Response } from 'express';
import { DeviceModel } from '../models/device.model';
import { DeviceType } from '../types';
import { accessibleDevices } from '../services/access.service';
import {
  listSubscriptions, PUSH_EVENTS, pushConfigured, pushEventsFor, PushError, pushPublicKey, removeSubscription, saveRules,
  saveSubscription, sendTest, userNotifications,
} from '../services/push.service';

const run = (handler: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response) => {
  try {
    await handler(req, res);
  } catch (error) {
    if (error instanceof PushError) return res.status(error.status).json({ message: error.message });
    console.error('[push]', error);
    return res.status(500).json({ message: String(error) });
  }
};

const signedIn = (req: Request, res: Response) => {
  if (req.user) return true;
  res.status(401).json({ message: 'Zaloguj się.' });
  return false;
};

// GET /push/settings: wszystko, czego potrzebuje karta „Powiadomienia”
export const getPushSettings = run(async (req, res) => {
  if (!signedIn(req, res)) return;
  const user = req.user!;
  const access = await accessibleDevices(user);
  const devices = (await DeviceModel.find({ _id: { $in: [...access.keys()] } }).select('name deviceId deviceType sortOrder').lean<{ _id: unknown; name?: string; deviceId: string; deviceType: DeviceType; sortOrder?: number }[]>())
    .filter((device) => pushEventsFor(device.deviceType).length > 0)
    .sort((a, b) => (a.sortOrder ?? 1e9) - (b.sortOrder ?? 1e9))
    .map((device) => ({ rootId: String(device._id), name: device.name || device.deviceId, deviceType: device.deviceType }));
  res.json({
    configured: pushConfigured(),
    publicKey: pushPublicKey(),
    subscriptions: await listSubscriptions(user),
    ...userNotifications(user),
    events: PUSH_EVENTS,
    devices,
  });
});

// POST /push/subscriptions {endpoint, keys, label}: „Włącz na tym urządzeniu”
export const postPushSubscription = run(async (req, res) => {
  if (!signedIn(req, res)) return;
  if (!pushConfigured()) throw new PushError('Powiadomienia są wyłączone na serwerze (brak kluczy VAPID).', 503);
  res.status(201).json(await saveSubscription(req.user!, req.body));
});

// DELETE /push/subscriptions/:id: „Wyłącz na tym urządzeniu” albo usunięcie innej przeglądarki z listy
export const deletePushSubscription = run(async (req, res) => {
  if (!signedIn(req, res)) return;
  await removeSubscription(req.user!, String(req.params.id));
  res.status(204).end();
});

// PUT /push/rules {rules: [{rootId, events}], quietFrom, quietTo}
export const putPushRules = run(async (req, res) => {
  if (!signedIn(req, res)) return;
  res.json(await saveRules(req.user!, req.body));
});

// POST /push/test: powiadomienie próbne do wszystkich przeglądarek konta
export const postPushTest = run(async (req, res) => {
  if (!signedIn(req, res)) return;
  res.json({ sent: await sendTest(req.user!) });
});
