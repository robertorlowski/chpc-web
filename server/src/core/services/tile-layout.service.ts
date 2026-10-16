// Układ listy sterowników osobno dla każdego konta (decyzja użytkownika 2026-10-16): pola szachownicy
// (users.deviceOrder: Root ID sterownika, id kafelka pogody albo null = puste pole) i ukryte kafelki
// (users.hiddenTiles). Konto bez zapisanego układu: użytkownik systemowy dostaje układ wspólny sprzed kont
// (devices/weather_tiles: sortOrder, hidden), pozostali kafelki po kolei, bez ukrytych. Bez req.user
// (AUTH_DISABLED=1) obowiązuje układ wspólny jak przed kontami (device.service setDevicesOrder).
import { UserEntry, UserModel } from '../models/user.model';

export type TileViewer = Pick<UserEntry, '_id' | 'isSystem'>;
type Layout = { order?: (string | null)[]; hidden?: string[] };
type Placed = { id: string; sortOrder?: number; hidden?: boolean };

// świeży odczyt: użytkownik z sesji bywa z pamięci podręcznej
async function loadLayout(viewer: TileViewer): Promise<Layout> {
  const user = await UserModel.findById(viewer._id).select('deviceOrder hiddenTiles').lean<UserEntry>();
  return { order: user?.deviceOrder ?? undefined, hidden: user?.hiddenTiles ?? undefined };
}

// Pole i ukrycie kafelków w układzie konta (zastępuje sortOrder i hidden z dokumentów).
export async function placeForViewer<T extends Placed>(viewer: TileViewer, items: T[]): Promise<T[]> {
  const { order, hidden } = await loadLayout(viewer);
  return items.map((item) => {
    const index = order ? order.indexOf(item.id) : -1;
    return {
      ...item,
      sortOrder: order ? (index >= 0 ? index : undefined) : viewer.isSystem ? item.sortOrder : undefined,
      hidden: hidden ? hidden.includes(item.id) : viewer.isSystem ? !!item.hidden : false,
    };
  });
}

// „Gotowe” w trybie „Zmień układ”: pola szachownicy konta (allowed = kafelki widoczne dla konta).
export async function saveViewerOrder(viewer: TileViewer, cells: unknown, allowed: Set<string>): Promise<void> {
  if (!Array.isArray(cells) || cells.some((id) => id !== null && (typeof id !== 'string' || !allowed.has(id)))) {
    throw new Error('rootIds: lista Root ID dostępnych sterowników i kafelków pogody albo null (puste pole).');
  }
  const ids = cells.filter((id): id is string => id !== null);
  if (new Set(ids).size !== ids.length) throw new Error('rootIds: lista unikalnych Root ID.');
  await UserModel.updateOne({ _id: viewer._id }, { $set: { deviceOrder: cells } });
}

// Oko w trybie „Zmień układ”: ukrycie kafelka tylko na koncie. Pierwsza zmiana konta bez zapisanych ukryć
// przejmuje ukrycia, które konto dotąd widziało (systemowy: wspólne z dokumentów).
export async function setViewerHidden(viewer: TileViewer, id: string, hide: boolean, current: Placed[]): Promise<void> {
  const { hidden } = await loadLayout(viewer);
  const start = hidden ?? (viewer.isSystem ? current.filter((item) => item.hidden).map((item) => item.id) : []);
  const next = hide ? [...new Set([...start, id])] : start.filter((other) => other !== id);
  await UserModel.updateOne({ _id: viewer._id }, { $set: { hiddenTiles: next } });
}

// Nowy kafelek pogody konta z zapisanym układem: w pierwszym wolnym polu za ostatnim zajętym.
export async function appendToViewerOrder(viewer: TileViewer, id: string): Promise<number | undefined> {
  const { order } = await loadLayout(viewer);
  if (!order) return undefined;
  const next = [...order];
  while (next.length && next[next.length - 1] === null) next.pop();
  next.push(id);
  await UserModel.updateOne({ _id: viewer._id }, { $set: { deviceOrder: next } });
  return next.length - 1;
}

// Ukrycia kont, które ukryły któryś z podanych kafelków (pobieranie pogody przez włącznik pomija kafelek
// ukryty przez jego właściciela, a kafelek bez właściciela — ukryty wspólnie albo przez użytkownika systemowego).
export async function viewersHiding(ids: string[]): Promise<{ id: string; isSystem: boolean; hidden: Set<string> }[]> {
  const users = await UserModel.find({ hiddenTiles: { $in: ids } }).select('isSystem hiddenTiles').lean<UserEntry[]>();
  return users.map((user) => ({ id: String(user._id), isSystem: !!user.isSystem, hidden: new Set(user.hiddenTiles ?? []) }));
}
