// Udostępnianie sterownika (karta „Udostępnianie” w Ustawieniach, 2026-10-11): właściciel podaje e-mail i zakładki.
// Osoba z kontem widzi sterownik od razu, bez konta — po pierwszym logowaniu tym adresem (zaproszenie mailem).
// Osoba z dostępem nie zmienia nazwy, nie zleca aktualizacji firmware i nie udostępnia dalej (canManage).
import { DeviceShareEntry, DeviceShareModel } from '../models/device-share.model';
import { DeviceModel } from '../models/device.model';
import { UserEntry, UserModel } from '../models/user.model';
import { TABS } from './access.service';
import { AuthError, normalizeEmail, userName } from './auth.service';
import { clientBaseUrl, sendMail, shareMail } from './mail.service';
import { DEFAULT_LANG, isLang, Lang, tabLabel, texts } from '../i18n';

function parseTabs(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((tab) => !(TABS as readonly string[]).includes(tab))) {
    throw new AuthError(texts('err.pickTab'));
  }
  return TABS.filter((tab) => value.includes(tab));
}

async function publicShare(share: DeviceShareEntry) {
  const user = share.userId ? await UserModel.findById(share.userId).lean<UserEntry>() : null;
  return {
    id: String(share._id),
    email: share.email,
    name: user ? userName(user) : null,
    /** false = zaproszenie czeka na rejestrację */
    registered: !!user,
    tabs: share.tabs,
    createdAt: share.createdAt,
  };
}

export async function listShares(rootId: string) {
  const shares = await DeviceShareModel.find({ rootId }).sort({ createdAt: 1 }).lean<DeviceShareEntry[]>();
  return Promise.all(shares.map(publicShare));
}

export async function createShare(owner: UserEntry, rootId: string, body: { email?: unknown; tabs?: unknown }, origin?: string, lang: Lang = DEFAULT_LANG) {
  const email = normalizeEmail(body.email);
  if (!email) throw new AuthError(texts('err.emailInvalid'));
  const tabs = parseTabs(body.tabs);
  const device = await DeviceModel.findById(rootId).select('ownerId name deviceId').lean<{ ownerId?: string; name?: string; deviceId: string }>();
  if (!device) throw new AuthError(texts('err.deviceNotFound'), 404);
  if (!device.ownerId) throw new AuthError(texts('err.deviceNoOwner'), 409);
  const deviceOwner = await UserModel.findById(device.ownerId).lean<UserEntry>();
  if (deviceOwner?.email === email) throw new AuthError(texts('err.ownerEmail'));
  if (await DeviceShareModel.exists({ rootId, email })) throw new AuthError(texts('err.alreadyShared'), 409);
  const user = await UserModel.findOne({ email }).lean<UserEntry>();
  const share = await DeviceShareModel.create({ rootId, ownerId: device.ownerId, email, userId: user ? String(user._id) : null, tabs });
  // mail w języku zaproszonego (konto z wybranym językiem), inaczej w języku zapraszającego (żądania)
  const mailLang: Lang = isLang(user?.language) ? user!.language as Lang : lang;
  const tabsText = tabs.map((tab) => tabLabel(tab, mailLang)).join(', ');
  const from = userName(deviceOwner ?? owner);
  void sendMail(shareMail(email, from, device.name || device.deviceId, tabsText, clientBaseUrl(origin), !!user, mailLang))
    .catch((error) => console.error('[mail] udostępnienie:', error));
  return publicShare(share.toObject());
}

export async function updateShare(rootId: string, id: string, body: { tabs?: unknown }) {
  const tabs = parseTabs(body.tabs);
  const share = await DeviceShareModel.findOneAndUpdate({ _id: id, rootId }, { $set: { tabs } }, { new: true }).lean<DeviceShareEntry>();
  if (!share) throw new AuthError(texts('err.shareNotFound'), 404);
  return publicShare(share);
}

export async function deleteShare(rootId: string, id: string) {
  const result = await DeviceShareModel.deleteOne({ _id: id, rootId });
  if (!result.deletedCount) throw new AuthError(texts('err.shareNotFound'), 404);
}
