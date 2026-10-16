// Kafelki pogody (core/models/weather-tile.model.ts): lista z bieżącą pogodą, dodawanie, zmiana, usuwanie,
// miejsca do pobrania przez włącznik (weather_queries w odpowiedzi POST /switch/state) i kafelek „Dom”.
// Pogodę dla każdego miejsca trzyma w pamięci meteo.service (klucz = id kafelka; dom także pod kluczem
// ze starszego włącznika, który pobiera jedno miejsce).
import { Types } from 'mongoose';
import { DeviceModel } from '../models/device.model';
import { WeatherTileDocument, WeatherTileModel } from '../models/weather-tile.model';
import { getWeatherFor, setHomeWeatherKey, WEATHER_LOCATION, Weather } from './meteo.service';

export const MAX_WEATHER_TILES = 8;
const NAME_MAX = 40;

export type WeatherTileInput = { name?: unknown; lat?: unknown; lon?: unknown; hidden?: unknown };
export type WeatherTile = {
  id: string; name: string; lat: number; lon: number; sortOrder?: number; hidden: boolean; home: boolean;
  weather: Weather | null;
};

const isObjectId = (value: unknown): value is string => typeof value === 'string' && Types.ObjectId.isValid(value);

// Sprawdza pola z aplikacji; przy create wszystkie wymagane, przy update tylko podane.
export function parseWeatherTile(input: WeatherTileInput, partial = false) {
  const out: { name?: string; lat?: number; lon?: number; hidden?: boolean } = {};
  if (input.name !== undefined || !partial) {
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > NAME_MAX) {
      throw new Error(`name: napis do ${NAME_MAX} znaków.`);
    }
    out.name = input.name.trim();
  }
  if (input.lat !== undefined || !partial) {
    if (typeof input.lat !== 'number' || !Number.isFinite(input.lat) || input.lat < -90 || input.lat > 90) throw new Error('lat: liczba od -90 do 90.');
    out.lat = input.lat;
  }
  if (input.lon !== undefined || !partial) {
    if (typeof input.lon !== 'number' || !Number.isFinite(input.lon) || input.lon < -180 || input.lon > 180) throw new Error('lon: liczba od -180 do 180.');
    out.lon = input.lon;
  }
  if (input.hidden !== undefined) {
    if (typeof input.hidden !== 'boolean') throw new Error('hidden: true albo false.');
    out.hidden = input.hidden;
  }
  return out;
}

const toPublic = (tile: WeatherTileDocument): WeatherTile => ({
  id: String(tile._id), name: tile.name, lat: tile.lat, lon: tile.lon, sortOrder: tile.sortOrder,
  hidden: tile.hidden ?? false, home: tile.home ?? false, weather: getWeatherFor(String(tile._id)),
});

// Kafelek „Dom” z WEATHER_LOCATION, gdy go nie ma (pierwsze uruchomienie po wdrożeniu); przed sterownikami
// (sortOrder -1). Zapamiętuje jego id w meteo.service, żeby pogoda ze starszego włącznika i GET /temperature
// dotyczyły domu.
export async function ensureHomeWeatherTile(): Promise<WeatherTileDocument> {
  let home = await WeatherTileModel.findOne({ home: true }).lean<WeatherTileDocument>();
  if (!home) {
    home = (await WeatherTileModel.create({ name: 'Dom', ...WEATHER_LOCATION, home: true, sortOrder: -1 })).toObject();
  }
  setHomeWeatherKey(String(home._id));
  return home;
}

export async function listWeatherTiles(): Promise<WeatherTile[]> {
  await ensureHomeWeatherTile();
  const tiles = await WeatherTileModel.find().sort({ name: 1 }).lean<WeatherTileDocument[]>();
  const rank = (tile: WeatherTileDocument) => tile.sortOrder ?? Number.MAX_SAFE_INTEGER;
  return tiles.sort((a, b) => rank(a) - rank(b)).map(toPublic);
}

export async function createWeatherTile(input: WeatherTileInput): Promise<WeatherTile> {
  const data = parseWeatherTile(input);
  await ensureHomeWeatherTile();
  if (await WeatherTileModel.countDocuments() >= MAX_WEATHER_TILES) throw new Error(`Najwyżej ${MAX_WEATHER_TILES} kafelków pogody.`);
  // nowy kafelek w pierwszym wolnym polu za ostatnim zajętym (sterownik albo kafelek pogody)
  const [lastTile, lastDevice] = await Promise.all([
    WeatherTileModel.findOne().sort({ sortOrder: -1 }).select('sortOrder').lean<WeatherTileDocument>(),
    DeviceModel.findOne().sort({ sortOrder: -1 }).select('sortOrder').lean<{ sortOrder?: number }>(),
  ]);
  const tile = await WeatherTileModel.create({ ...data, sortOrder: Math.max(lastTile?.sortOrder ?? -1, lastDevice?.sortOrder ?? -1) + 1 });
  return toPublic(tile.toObject());
}

export async function updateWeatherTile(id: string, input: WeatherTileInput): Promise<WeatherTile> {
  if (!isObjectId(id)) throw new Error('Weather tile not found.');
  const data = parseWeatherTile(input, true);
  const tile = await WeatherTileModel.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }).lean<WeatherTileDocument>();
  if (!tile) throw new Error('Weather tile not found.');
  return toPublic(tile);
}

export async function removeWeatherTile(id: string): Promise<void> {
  if (!isObjectId(id)) throw new Error('Weather tile not found.');
  const tile = await WeatherTileModel.findByIdAndDelete(id).lean<WeatherTileDocument>();
  if (!tile) throw new Error('Weather tile not found.');
}

export const countWeatherTiles = (ids: string[]) => WeatherTileModel.countDocuments({ _id: { $in: ids } });

export async function setWeatherTilesOrder(entries: { id: string; index: number }[]): Promise<void> {
  if (!entries.length) return;
  await WeatherTileModel.bulkWrite(entries.map(({ id, index }) => ({
    updateOne: { filter: { _id: id }, update: { $set: { sortOrder: index } } },
  })));
}

// Miejsca, dla których włącznik pobiera pogodę: dom zawsze (GET /temperature), pozostałe tylko widoczne.
export async function weatherQueries(): Promise<{ id: string; lat: number; lon: number }[]> {
  const home = await ensureHomeWeatherTile();
  const tiles = await WeatherTileModel.find({ $or: [{ home: true }, { hidden: { $ne: true } }] })
    .select('lat lon home').lean<WeatherTileDocument[]>();
  return [home, ...tiles.filter((tile) => !tile.home)].map((tile) => ({ id: String(tile._id), lat: tile.lat, lon: tile.lon }));
}
