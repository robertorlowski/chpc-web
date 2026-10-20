// Konta użytkowników (2026-10-11): logowanie i rejestracja kodem albo linkiem z maila (jeden przebieg),
// sesje (token w nagłówku Authorization, bo klient i API są na różnych domenach), użytkownik systemowy
// (hasło SYSTEM_PASSWORD), dane konta, zmiana e-maila, usunięcie konta z danymi sterowników i jednorazowe
// przypisanie sterowników istniejących przed kontami do INITIAL_OWNER_EMAIL (domyślnie robert@infotower.pl).
import crypto from 'crypto';
import mongoose from 'mongoose';
import { AuthCodeEntry, AuthCodeModel, AuthCodePurpose, SessionEntry, SessionModel } from '../models/auth.model';
import { DeviceShareModel } from '../models/device-share.model';
import { DeviceModel } from '../models/device.model';
import { UserEntry, UserLocation, UserModel } from '../models/user.model';
import { forgetDeviceInfo } from './device-info.service';
import { assertMailAvailable } from './mail-relay.service';
import {
  adminEmail, clientBaseUrl, deleteAccountMail, emailChangeMail, emailChangedMail, loginMail, registrationAdminMail, sendMail,
} from './mail.service';

export const CODE_TTL_MS = 10 * 60 * 1000;
export const RESEND_MS = 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const SESSION_REMEMBER_MS = 90 * 24 * 60 * 60 * 1000;
// sesja bez „Zapamiętaj”: klient trzyma token do zamknięcia przeglądarki, serwer najwyżej 24 h od ostatniego użycia
export const SESSION_IDLE_MS = 24 * 60 * 60 * 1000;
const SESSION_TOUCH_MS = 5 * 60 * 1000;
const SYSTEM_MAX_FAILURES = 5;
const SYSTEM_LOCK_MS = 60 * 1000;
export const SYSTEM_LOGIN = 'system';

export class AuthError extends Error {
  constructor(message: string, public status = 400, public retryAfterSeconds?: number) {
    super(message);
  }
}

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('base64url');
const codeHash = (email: string, code: string) => sha256(`${email}:${code}`);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && EMAIL.test(email) ? email : null;
}

export const isProfileComplete = (user: UserEntry) => !!(user.isSystem || (user.firstName && user.lastName && user.country));
export const userName = (user: UserEntry) =>
  user.isSystem ? SYSTEM_LOGIN : [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || '';

export function publicUser(user: UserEntry) {
  return {
    id: String(user._id),
    email: user.email ?? null,
    isSystem: !!user.isSystem,
    firstName: user.firstName ?? '',
    lastName: user.lastName ?? '',
    street: user.street ?? '',
    postalCode: user.postalCode ?? '',
    city: user.city ?? '',
    country: user.country ?? '',
    location: user.location ?? null,
    profileComplete: isProfileComplete(user),
  };
}

// ------------------------------------------------------------------ kody i linki z maila

async function createCode(purpose: AuthCodePurpose, email: string, options: { userId?: string; link?: boolean } = {}) {
  const now = Date.now();
  const filter = options.userId ? { purpose, userId: options.userId } : { purpose, email };
  const recent = await AuthCodeModel.findOne(filter).sort({ createdAt: -1 }).lean<AuthCodeEntry>();
  if (recent && now - new Date(recent.createdAt).getTime() < RESEND_MS) {
    const wait = Math.ceil((RESEND_MS - (now - new Date(recent.createdAt).getTime())) / 1000);
    throw new AuthError(`Kod został wysłany przed chwilą. Nowy można wysłać za ${wait} s.`, 429, wait);
  }
  await AuthCodeModel.deleteMany(filter);
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const token = options.link ? newToken() : undefined;
  const expiresAt = new Date(now + CODE_TTL_MS);
  await AuthCodeModel.create({
    purpose, email, userId: options.userId, codeHash: codeHash(email, code), tokenHash: token ? sha256(token) : undefined, expiresAt,
  });
  return { code, token, expiresAt };
}

// Kod albo link: jednorazowy, ważny CODE_TTL_MS; po MAX_ATTEMPTS błędnych kodach trzeba wysłać nowy.
async function consumeCode(
  purpose: AuthCodePurpose,
  by: { token?: unknown; code?: unknown; email?: string; userId?: string },
): Promise<AuthCodeEntry> {
  const now = new Date();
  if (typeof by.token === 'string' && by.token) {
    const doc = await AuthCodeModel.findOneAndDelete({ purpose, tokenHash: sha256(by.token), expiresAt: { $gt: now } }).lean<AuthCodeEntry>();
    if (!doc) throw new AuthError('Link wygasł albo został już użyty.');
    return doc;
  }
  const code = typeof by.code === 'string' ? by.code.replace(/\s/g, '') : '';
  if (!/^\d{6}$/.test(code)) throw new AuthError('Kod ma 6 cyfr.');
  const filter = by.userId ? { purpose, userId: by.userId } : { purpose, email: by.email };
  const doc = await AuthCodeModel.findOne({ ...filter, expiresAt: { $gt: now } }).sort({ createdAt: -1 });
  if (!doc) throw new AuthError('Kod wygasł albo nie został wysłany — wyślij nowy.');
  if (doc.attempts >= MAX_ATTEMPTS) throw new AuthError('Za dużo błędnych prób — wyślij nowy kod.');
  if (doc.codeHash !== codeHash(doc.email, code)) {
    doc.attempts += 1;
    await doc.save();
    const left = MAX_ATTEMPTS - doc.attempts;
    throw new AuthError(left > 0 ? `Błędny kod. Zostało prób: ${left}.` : 'Błędny kod. Wyślij nowy kod.');
  }
  await AuthCodeModel.deleteOne({ _id: doc._id });
  return doc.toObject();
}

// ------------------------------------------------------------------ sesje

// Pamięć podręczna sesji (token → sesja i użytkownik) na 30 s: aplikacja odpytuje API co kilka sekund.
const SESSION_CACHE_MS = 30 * 1000;
const sessionCache = new Map<string, { at: number; session: SessionEntry; user: UserEntry }>();
/** po zmianie dokumentu users poza tym serwisem (np. reguły powiadomień): następne żądanie czyta go z bazy */
export const forgetUserSessions = (userId: string) => {
  for (const [key, value] of sessionCache) if (value.session.userId === userId) sessionCache.delete(key);
};

async function createSession(userId: string, remember = false) {
  const token = newToken();
  const now = Date.now();
  await SessionModel.create({
    tokenHash: sha256(token), userId, remember,
    expiresAt: new Date(now + (remember ? SESSION_REMEMBER_MS : SESSION_IDLE_MS)), lastSeenAt: new Date(now),
  });
  return token;
}

export async function sessionFromToken(token: string): Promise<{ session: SessionEntry; user: UserEntry } | null> {
  const key = sha256(token);
  const now = Date.now();
  const cached = sessionCache.get(key);
  if (cached && now - cached.at < SESSION_CACHE_MS && new Date(cached.session.expiresAt).getTime() > now) {
    return { session: cached.session, user: cached.user };
  }
  const session = await SessionModel.findOne({ tokenHash: key, expiresAt: { $gt: new Date(now) } }).lean<SessionEntry>();
  const user = session ? await UserModel.findById(session.userId).lean<UserEntry>() : null;
  if (!session || !user) {
    sessionCache.delete(key);
    return null;
  }
  // bez „Zapamiętaj”: 24 h od ostatniego użycia (zapis najwyżej co 5 min)
  if (!session.remember && now - new Date(session.lastSeenAt).getTime() > SESSION_TOUCH_MS) {
    session.lastSeenAt = new Date(now);
    session.expiresAt = new Date(now + SESSION_IDLE_MS);
    await SessionModel.updateOne({ _id: session._id }, { $set: { lastSeenAt: session.lastSeenAt, expiresAt: session.expiresAt } });
  }
  sessionCache.set(key, { at: now, session, user });
  return { session, user };
}

// „Zapamiętać Twoje dane … na najbliższe 90 dni?”: tak = 90 dni od zalogowania, nie = 24 h od ostatniego użycia.
export async function setRemember(token: string, remember: boolean) {
  const key = sha256(token);
  const session = await SessionModel.findOne({ tokenHash: key });
  if (!session) throw new AuthError('Sesja wygasła — zaloguj się ponownie.', 401);
  session.remember = remember;
  session.expiresAt = new Date(remember ? new Date(session.createdAt).getTime() + SESSION_REMEMBER_MS : Date.now() + SESSION_IDLE_MS);
  await session.save();
  sessionCache.delete(key);
  return { remember, expiresAt: session.expiresAt };
}

export async function logout(token: string) {
  const key = sha256(token);
  sessionCache.delete(key);
  await SessionModel.deleteOne({ tokenHash: key });
}

// ------------------------------------------------------------------ logowanie i rejestracja

export async function startLogin(emailValue: unknown, origin?: string) {
  const email = normalizeEmail(emailValue);
  if (!email) throw new AuthError('Podaj poprawny adres e-mail.');
  // przekaźnik poczty bez sterownika w sieci: błąd przed utworzeniem kodu (inaczej kolejna próba czekałaby 60 s)
  await assertMailAvailable();
  const { code, token, expiresAt } = await createCode('login', email, { link: true });
  const url = `${clientBaseUrl(origin)}/login?token=${encodeURIComponent(token as string)}`;
  await sendMail(loginMail(email, code, url, expiresAt));
  return { email, resendAfterSeconds: Math.round(RESEND_MS / 1000) };
}

// Kod (z e-mailem) albo link (token): nowy adres zakłada konto (bez danych osobowych — formularz w kliencie).
export async function verifyLogin(body: { email?: unknown; code?: unknown; token?: unknown }) {
  const email = normalizeEmail(body.email);
  if (!body.token && !email) throw new AuthError('Podaj adres e-mail.');
  const doc = await consumeCode('login', { token: body.token, code: body.code, email: email ?? undefined });
  let user = await UserModel.findOne({ email: doc.email }).lean<UserEntry>();
  const created = !user;
  if (!user) {
    user = (await UserModel.create({ email: doc.email })).toObject();
    if (adminEmail()) void sendMail(registrationAdminMail(adminEmail(), doc.email)).catch((error) => console.error('[mail] administrator:', error));
  }
  // zaproszenia wysłane na ten adres przed założeniem konta
  await DeviceShareModel.updateMany({ email: doc.email, userId: null }, { $set: { userId: String(user._id) } });
  const token = await createSession(String(user._id));
  return { token, created, user: publicUser(user) };
}

const systemFailures = { count: 0, lockedUntil: 0 };
export async function systemLogin(password: unknown) {
  const expected = process.env.SYSTEM_PASSWORD;
  if (!expected) throw new AuthError('Logowanie systemowe jest wyłączone.', 403);
  const now = Date.now();
  if (systemFailures.lockedUntil > now) {
    throw new AuthError('Za dużo błędnych prób — spróbuj za minutę.', 429, Math.ceil((systemFailures.lockedUntil - now) / 1000));
  }
  const ok = typeof password === 'string'
    && crypto.timingSafeEqual(Buffer.from(sha256(password)), Buffer.from(sha256(expected)));
  if (!ok) {
    systemFailures.count += 1;
    if (systemFailures.count >= SYSTEM_MAX_FAILURES) {
      systemFailures.count = 0;
      systemFailures.lockedUntil = now + SYSTEM_LOCK_MS;
    }
    throw new AuthError('Błędne hasło.', 401);
  }
  systemFailures.count = 0;
  const user = await ensureSystemUser();
  return { token: await createSession(String(user._id)), created: false, user: publicUser(user) };
}

export async function ensureSystemUser(): Promise<UserEntry> {
  return (await UserModel.findOneAndUpdate(
    { isSystem: true },
    { $setOnInsert: { isSystem: true } },
    { upsert: true, new: true },
  ).lean<UserEntry>()) as UserEntry;
}

// ------------------------------------------------------------------ dane konta

const text = (value: unknown, field: string, max: number, required: boolean) => {
  const result = typeof value === 'string' ? value.trim() : value === undefined || value === null ? '' : null;
  if (result === null || result.length > max) throw new AuthError(`${field}: tekst do ${max} znaków.`);
  if (required && !result) throw new AuthError(`${field}: pole obowiązkowe.`);
  return result;
};

function parseLocation(value: unknown): UserLocation | null {
  if (value === null || value === undefined) return null;
  const { lat, lng } = value as { lat?: unknown; lng?: unknown };
  if (typeof lat !== 'number' || typeof lng !== 'number' || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new AuthError('Lokalizacja: szerokość −90…90, długość −180…180.');
  }
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
}

// Obowiązkowe: imię, nazwisko i kraj (decyzja 2026-10-11; miejscowość nie).
export async function updateProfile(user: UserEntry, body: Record<string, unknown>) {
  if (user.isSystem) throw new AuthError('Użytkownik systemowy nie ma danych osobowych.', 403);
  const data = {
    firstName: text(body.firstName, 'Imię', 80, true),
    lastName: text(body.lastName, 'Nazwisko', 80, true),
    street: text(body.street, 'Ulica i numer', 120, false),
    postalCode: text(body.postalCode, 'Kod pocztowy', 20, false),
    city: text(body.city, 'Miejscowość', 120, false),
    country: text(body.country, 'Kraj', 80, true),
    location: parseLocation(body.location),
  };
  const updated = await UserModel.findByIdAndUpdate(user._id, { $set: data }, { new: true }).lean<UserEntry>();
  forgetUserSessions(String(user._id));
  return publicUser(updated as UserEntry);
}

export async function startEmailChange(user: UserEntry, emailValue: unknown) {
  if (user.isSystem) throw new AuthError('Użytkownik systemowy nie ma adresu e-mail.', 403);
  const email = normalizeEmail(emailValue);
  if (!email) throw new AuthError('Podaj poprawny adres e-mail.');
  if (email === user.email) throw new AuthError('To jest obecny adres konta.');
  if (await UserModel.exists({ email })) throw new AuthError('Ten adres ma już inne konto.', 409);
  await assertMailAvailable();
  const { code, expiresAt } = await createCode('email-change', email, { userId: String(user._id) });
  await sendMail(emailChangeMail(email, code, expiresAt));
  return { email, resendAfterSeconds: Math.round(RESEND_MS / 1000) };
}

export async function verifyEmailChange(user: UserEntry, codeValue: unknown) {
  const doc = await consumeCode('email-change', { code: codeValue, userId: String(user._id) });
  if (await UserModel.exists({ email: doc.email, _id: { $ne: user._id } })) throw new AuthError('Ten adres ma już inne konto.', 409);
  const updated = await UserModel.findByIdAndUpdate(user._id, { $set: { email: doc.email } }, { new: true }).lean<UserEntry>();
  // udostępnienia: adres przy istniejących i zaproszenia czekające na nowy adres
  await DeviceShareModel.updateMany({ userId: String(user._id) }, { $set: { email: doc.email } });
  await DeviceShareModel.updateMany({ email: doc.email, userId: null }, { $set: { userId: String(user._id) } });
  forgetUserSessions(String(user._id));
  if (user.email) void sendMail(emailChangedMail(user.email, doc.email)).catch((error) => console.error('[mail] zmiana e-maila:', error));
  return publicUser(updated as UserEntry);
}

// ------------------------------------------------------------------ usunięcie konta

export async function startDeleteAccount(user: UserEntry, origin?: string) {
  if (user.isSystem || !user.email) throw new AuthError('Użytkownika systemowego nie można usunąć.', 403);
  const devices = await DeviceModel.countDocuments({ ownerId: String(user._id) });
  await assertMailAvailable();
  const { token } = await createCode('delete-account', user.email, { userId: String(user._id), link: true });
  const url = `${clientBaseUrl(origin)}/account/delete?token=${encodeURIComponent(token as string)}`;
  await sendMail(deleteAccountMail(user.email, url, devices));
  return { email: user.email, devices };
}

export async function confirmDeleteAccount(token: unknown) {
  const doc = await consumeCode('delete-account', { token });
  if (!doc.userId) throw new AuthError('Link nie wskazuje konta.');
  return deleteUserAndData(doc.userId);
}

// Kolekcje bez danych sterowników (pozostałe z polem rootId należą do sterowników).
const NOT_DEVICE_DATA = new Set(['users', 'sessions', 'auth_codes', 'device_shares', 'devices', 'firmware_images', 'firmware_offers', 'migrations']);

// Konto, jego sterowniki z całą historią (każda kolekcja z rootId), udostępnienia (jego i jemu) i sesje.
// Sterownik, który dalej działa, zgłosi się później sam jako nowy, bez właściciela.
export async function deleteUserAndData(userId: string) {
  const devices = await DeviceModel.find({ ownerId: userId }).select('_id').lean<{ _id: mongoose.Types.ObjectId }[]>();
  const ids = devices.map((device) => String(device._id));
  const rootIds = [...ids, ...devices.map((device) => device._id)];
  const db = mongoose.connection.db;
  if (db && ids.length) {
    for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
      if (NOT_DEVICE_DATA.has(name) || name.startsWith('system.')) continue;
      await db.collection(name).deleteMany({ rootId: { $in: rootIds } });
    }
  }
  await DeviceModel.deleteMany({ _id: { $in: ids } });
  ids.forEach((id) => forgetDeviceInfo(id));
  await DeviceShareModel.deleteMany({ $or: [{ rootId: { $in: ids } }, { userId }, { ownerId: userId }] });
  await SessionModel.deleteMany({ userId });
  await AuthCodeModel.deleteMany({ userId });
  await UserModel.deleteOne({ _id: userId });
  forgetUserSessions(userId);
  return { devices: ids.length };
}

// ------------------------------------------------------------------ migracja

const OWNERS_MIGRATION = 'device-owners-2026-10';

// Raz (znacznik w kolekcji migrations): sterowniki bez właściciela → konto INITIAL_OWNER_EMAIL, z kolejnością
// kafelków z dotychczasowego pola urządzeń (sortOrder). Później zgłoszone sterowniki
// zostają bez właściciela (decyzja 2026-10-11: nowymi sterownikami zajmiemy się osobno). Zawsze: konto system.
export async function migrateOwners() {
  await ensureSystemUser();
  const migrations = mongoose.connection.collection<{ _id: string; at: Date }>('migrations');
  if (await migrations.findOne({ _id: OWNERS_MIGRATION })) return 0;
  const email = normalizeEmail(process.env.INITIAL_OWNER_EMAIL ?? 'robert@infotower.pl') as string;
  const owner = (await UserModel.findOneAndUpdate({ email }, { $setOnInsert: { email } }, { upsert: true, new: true }).lean<UserEntry>()) as UserEntry;
  const devices = await DeviceModel.find({ $or: [{ ownerId: null }, { ownerId: { $exists: false } }] })
    .select('_id sortOrder').lean<{ _id: mongoose.Types.ObjectId; sortOrder?: number }[]>();
  await DeviceModel.updateMany({ _id: { $in: devices.map((device) => device._id) } }, { $set: { ownerId: String(owner._id) } });
  const order = devices.filter((device) => device.sortOrder !== undefined)
    .sort((a, b) => (a.sortOrder as number) - (b.sortOrder as number)).map((device) => String(device._id));
  if (order.length) await UserModel.updateOne({ _id: owner._id }, { $set: { deviceOrder: order } });
  await migrations.insertOne({ _id: OWNERS_MIGRATION, at: new Date() });
  console.log(`[konta] ${devices.length} sterowników przypisano do ${email}`);
  return devices.length;
}
