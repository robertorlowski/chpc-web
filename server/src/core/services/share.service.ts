// Udostępnianie sterownika (karta „Udostępnianie” w Ustawieniach, 2026-10-11): właściciel podaje e-mail i zakładki.
// Osoba z kontem widzi sterownik od razu, bez konta — po pierwszym logowaniu tym adresem (zaproszenie mailem).
// Osoba z dostępem nie zmienia nazwy, nie zleca aktualizacji firmware i nie udostępnia dalej (canManage).
import { DeviceShareEntry, DeviceShareModel } from '../models/device-share.model';
import { DeviceModel } from '../models/device.model';
import { UserEntry, UserModel } from '../models/user.model';
import { TAB_LABELS, TABS } from './access.service';
import { AuthError, normalizeEmail, userName } from './auth.service';
import { clientBaseUrl, sendMail, shareMail } from './mail.service';

function parseTabs(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((tab) => !(TABS as readonly string[]).includes(tab))) {
    throw new AuthError('Wybierz co najmniej jedną zakładkę.');
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

export async function createShare(owner: UserEntry, rootId: string, body: { email?: unknown; tabs?: unknown }, origin?: string) {
  const email = normalizeEmail(body.email);
  if (!email) throw new AuthError('Podaj poprawny adres e-mail.');
  const tabs = parseTabs(body.tabs);
  const device = await DeviceModel.findById(rootId).select('ownerId name deviceId').lean<{ ownerId?: string; name?: string; deviceId: string }>();
  if (!device) throw new AuthError('Nie znaleziono sterownika.', 404);
  if (!device.ownerId) throw new AuthError('Sterownik nie ma właściciela.', 409);
  const deviceOwner = await UserModel.findById(device.ownerId).lean<UserEntry>();
  if (deviceOwner?.email === email) throw new AuthError('To adres właściciela sterownika.');
  if (await DeviceShareModel.exists({ rootId, email })) throw new AuthError('Ta osoba ma już dostęp — zmień jej zakładki.', 409);
  const user = await UserModel.findOne({ email }).lean<UserEntry>();
  const share = await DeviceShareModel.create({ rootId, ownerId: device.ownerId, email, userId: user ? String(user._id) : null, tabs });
  const tabsText = tabs.map((tab) => TAB_LABELS[tab]).join(', ');
  const from = userName(deviceOwner ?? owner);
  void sendMail(shareMail(email, from, device.name || device.deviceId, tabsText, clientBaseUrl(origin), !!user))
    .catch((error) => console.error('[mail] udostępnienie:', error));
  return publicShare(share.toObject());
}

export async function updateShare(rootId: string, id: string, body: { tabs?: unknown }) {
  const tabs = parseTabs(body.tabs);
  const share = await DeviceShareModel.findOneAndUpdate({ _id: id, rootId }, { $set: { tabs } }, { new: true }).lean<DeviceShareEntry>();
  if (!share) throw new AuthError('Nie znaleziono udostępnienia.', 404);
  return publicShare(share);
}

export async function deleteShare(rootId: string, id: string) {
  const result = await DeviceShareModel.deleteOne({ _id: id, rootId });
  if (!result.deletedCount) throw new AuthError('Nie znaleziono udostępnienia.', 404);
}
