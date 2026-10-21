// /api/auth/* (konta użytkowników, 2026-10-11): logowanie kodem lub linkiem z maila, logowanie systemowe,
// „Zapamiętaj 90 dni”, wylogowanie, dane konta, zmiana e-maila i usunięcie konta. Ścieżki są publiczne dla
// middleware (session.ts), więc te, które dotyczą zalogowanego, sprawdzają req.user same (signedIn).
import { Request, Response } from 'express';
import {
  AuthError, confirmDeleteAccount, demoAvailable, demoLogin, logout, publicUser, setRemember, startDeleteAccount, startEmailChange,
  setLanguage, startLogin, systemLogin, updateProfile, verifyEmailChange, verifyLogin,
} from '../services/auth.service';
import { MailUnavailableError } from '../services/mail-relay.service';

const fail = (res: Response, error: unknown) => {
  if (error instanceof AuthError) {
    if (error.retryAfterSeconds) res.setHeader('Retry-After', String(error.retryAfterSeconds));
    return res.status(error.status).json({ message: error.message, retryAfterSeconds: error.retryAfterSeconds });
  }
  // przekaźnik poczty (MAIL_RELAY=1) bez sterownika w sieci: komunikat zamiast „Błąd serwera”
  if (error instanceof MailUnavailableError) return res.status(error.status).json({ message: error.message });
  console.error('[konta]', error);
  return res.status(500).json({ message: 'Błąd serwera — spróbuj ponownie.' });
};

const signedIn = (req: Request, res: Response) => {
  if (req.user && req.sessionToken) return true;
  res.status(401).json({ message: 'Zaloguj się.' });
  return false;
};

const run = (handler: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response) => {
  try {
    await handler(req, res);
  } catch (error) {
    fail(res, error);
  }
};

// POST /auth/start {email}: kod i link na e-mail (nowy adres = rejestracja po weryfikacji)
export const authStart = run(async (req, res) => {
  res.status(200).json(await startLogin(req.body?.email, req.header('origin')));
});

// POST /auth/verify {email, code} albo {token}: sesja; created = nowe konto (formularz danych)
export const authVerify = run(async (req, res) => {
  res.status(200).json(await verifyLogin(req.body ?? {}));
});

// POST /auth/system {password}: użytkownik systemowy (w kliencie: „system” wpisane w pole e-mail)
export const authSystem = run(async (req, res) => {
  res.status(200).json(await systemLogin(req.body?.password));
});

// POST /auth/remember {remember}: odpowiedź na „Zapamiętać Twoje dane … na najbliższe 90 dni?”
// GET /auth/demo: czy wersja demo jest włączona (przycisk pod logowaniem); POST /auth/demo: sesja demo (2 h, tylko odczyt)
export const authDemoAvailable = run(async (_req, res) => {
  res.status(200).json({ available: demoAvailable() });
});

export const authDemo = run(async (req, res) => {
  res.status(200).json(await demoLogin(req.ip ?? ''));
});

export const authRemember = run(async (req, res) => {
  if (!signedIn(req, res)) return;
  res.status(200).json(await setRemember(req.sessionToken as string, req.body?.remember === true));
});

export const authLogout = run(async (req, res) => {
  if (req.sessionToken) await logout(req.sessionToken);
  res.status(204).end();
});

export const authMe = run(async (req, res) => {
  if (!signedIn(req, res)) return;
  res.status(200).json(publicUser(req.user!));
});

export const authUpdateMe = run(async (req, res) => {
  if (!signedIn(req, res)) return;
  res.status(200).json(await updateProfile(req.user!, req.body ?? {}));
});

// PUT /auth/me/language {language}: język aplikacji konta ('pl' | 'en'); także użytkownik systemowy
export const authSetLanguage = run(async (req, res) => {
  if (!signedIn(req, res)) return;
  res.status(200).json(await setLanguage(req.user!, req.body?.language));
});

// POST /auth/email-change {email}: kod na nowy adres; POST /auth/email-change/verify {code}: zmiana
export const authEmailChange = run(async (req, res) => {
  if (!signedIn(req, res)) return;
  res.status(200).json(await startEmailChange(req.user!, req.body?.email));
});

export const authEmailChangeVerify = run(async (req, res) => {
  if (!signedIn(req, res)) return;
  res.status(200).json(await verifyEmailChange(req.user!, req.body?.code));
});

// POST /auth/delete: link potwierdzenia na e-mail konta; POST /auth/delete/confirm {token}: usunięcie
// (link z maila działa bez zalogowania — token potwierdza dostęp do skrzynki)
export const authDelete = run(async (req, res) => {
  if (!signedIn(req, res)) return;
  res.status(200).json(await startDeleteAccount(req.user!, req.header('origin')));
});

export const authDeleteConfirm = run(async (req, res) => {
  res.status(200).json(await confirmDeleteAccount(req.body?.token));
});
