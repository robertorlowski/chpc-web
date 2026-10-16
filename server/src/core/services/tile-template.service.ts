// Wzór kafelka listy sterowników (projektant kafelka w aplikacji, strona /tile-designer). Pola w % komórki,
// czcionki liczy klient z wysokości pola, więc serwer sprawdza tylko zakresy i nazwy pól. Brak zapisanego
// wzoru = null (klient używa wzoru wbudowanego, client/src/core/tile-template.ts).
import { TileTemplateModel } from '../models/tile-template.model';
import { TILE_SLOTS, TileField, TileTemplate } from '../types';

const KEY = 'default';
const ALIGNS = ['left', 'center', 'right'];

const inRange = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

// Sprawdza wzór z projektanta; zwraca kopię bez obcych kluczy albo rzuca błąd z opisem.
export function validateTileTemplate(input: unknown): TileTemplate {
  const body = input as Partial<TileTemplate> | null;
  if (!body || typeof body !== 'object') throw new Error('Template must be an object.');
  if (!inRange(body.w, 120, 800)) throw new Error('w must be 120–800.');
  if (!inRange(body.h, 60, 500)) throw new Error('h must be 60–500.');
  const gap = body.gap ?? 0;
  if (!inRange(gap, 0, 40)) throw new Error('gap must be 0–40.');
  if (!body.f || typeof body.f !== 'object') throw new Error('f must be an object.');
  const fields = {} as Record<string, TileField>;
  for (const slot of TILE_SLOTS) {
    const field = (body.f as Record<string, Partial<TileField>>)[slot];
    if (!field) throw new Error(`Missing field ${slot}.`);
    const { x, y, w, h, a, v } = field;
    if (!inRange(x, 0, 100) || !inRange(y, 0, 100) || !inRange(w, 0, 100) || !inRange(h, 0, 100)
      || x + w > 100.01 || y + h > 100.01) throw new Error(`Field ${slot} is outside the cell.`);
    if (!ALIGNS.includes(a as string)) throw new Error(`Field ${slot}: a must be left, center or right.`);
    if (typeof v !== 'boolean') throw new Error(`Field ${slot}: v must be boolean.`);
    fields[slot] = { x, y, w, h, a: a as TileField['a'], v };
  }
  return { w: Math.round(body.w), h: Math.round(body.h), gap: Math.round(gap), f: fields as TileTemplate['f'] };
}

export async function getTileTemplate(): Promise<TileTemplate | null> {
  const doc = await TileTemplateModel.findOne({ key: KEY }).lean();
  return doc?.template ?? null;
}

export async function saveTileTemplate(input: unknown): Promise<TileTemplate> {
  const template = validateTileTemplate(input);
  await TileTemplateModel.updateOne({ key: KEY }, { $set: { template } }, { upsert: true });
  return template;
}

// „Domyślny wzór” w projektancie: usuwa zapisany, klient wraca do wbudowanego
export async function resetTileTemplate(): Promise<void> {
  await TileTemplateModel.deleteOne({ key: KEY });
}
