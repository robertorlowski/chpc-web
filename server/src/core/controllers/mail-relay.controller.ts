// Przekaźnik poczty (2026-10-17, opis w services/mail-relay.service.ts).
// Sterownik (włącznik, co; ?rootId=&deviceId=, bez logowania — treść jest zaszyfrowana kluczem płytki):
//   GET  /mail/config  — stan klucza i zaszyfrowane dane SMTP (po zatwierdzeniu klucza, po błędzie logowania SMTP)
//   GET  /mail/next    — najstarszy mail do wysłania, zaszyfrowany ({id, mail}), albo {} gdy nic nie ma
//   POST /mail/result  — wynik {id, ok, receipt, error?}
// Aplikacja (tylko użytkownik systemowy):
//   POST   /devices/:rootId/mail-key {fingerprint} — zatwierdzenie klucza płytki
//   DELETE /devices/:rootId/mail-key               — usunięcie klucza (sterownik przestaje wysyłać)
import { Request, Response } from 'express';
import {
  MailRelayError, approveMailKey, mailConfigFor, mailKeyInfo, mailResult, nextMailFor, relayDevice, revokeMailKey,
} from '../services/mail-relay.service';

const fail = (res: Response, error: unknown) => {
  if (error instanceof MailRelayError) return res.status(error.status).json({ message: error.message });
  console.error('[mail]', error);
  return res.status(500).json({ message: 'Błąd serwera.' });
};

const systemOnly = (req: Request, res: Response) => {
  if (req.user?.isSystem) return true;
  res.status(403).json({ message: 'Klucz poczty zatwierdza tylko użytkownik systemowy.' });
  return false;
};

export async function getMailConfig(req: Request, res: Response) {
  try {
    const device = await relayDevice(req.query.rootId, req.query.deviceId);
    return res.status(200).json(mailConfigFor(device) ?? {});
  } catch (error) {
    return fail(res, error);
  }
}

export async function getNextMail(req: Request, res: Response) {
  try {
    const device = await relayDevice(req.query.rootId, req.query.deviceId);
    return res.status(200).json((await nextMailFor(device)) ?? {});
  } catch (error) {
    return fail(res, error);
  }
}

export async function postMailResult(req: Request, res: Response) {
  try {
    const device = await relayDevice(req.query.rootId, req.query.deviceId);
    return res.status(200).json(await mailResult(device, req.body ?? {}));
  } catch (error) {
    return fail(res, error);
  }
}

export async function approveDeviceMailKey(req: Request<{ rootId: string }>, res: Response) {
  if (!systemOnly(req, res)) return;
  try {
    const fingerprint = typeof req.body?.fingerprint === 'string' ? req.body.fingerprint : undefined;
    return res.status(200).json(mailKeyInfo(await approveMailKey(req.params.rootId, fingerprint)) ?? {});
  } catch (error) {
    return fail(res, error);
  }
}

export async function revokeDeviceMailKey(req: Request<{ rootId: string }>, res: Response) {
  if (!systemOnly(req, res)) return;
  try {
    await revokeMailKey(req.params.rootId);
    return res.status(200).json({});
  } catch (error) {
    return fail(res, error);
  }
}
