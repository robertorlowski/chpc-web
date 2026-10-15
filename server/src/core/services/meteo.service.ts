// Temperatura zewnętrzna i pogoda (pasek nad kafelkami, t_out w rekordach hp, ekran sterownika co, GET /temperature).
//
// Temperatura: z czujnika zewnętrznego kotła pelletowego (outside_temp z odczytu sterownika pieca; od 2026-10-04
// zamiast stacji IMGW Zakopane, decyzja użytkownika). Ustawia ją moduł kotła przy każdym odczycie i po starcie
// serwera z ostatniego odczytu w bazie (core nie importuje modułów). Pomiar starszy niż OUTDOOR_MAX_AGE_MS jest
// pomijany; wtedy (i w domu bez kotła) temperatura z prognozy Open-Meteo, jeśli jest świeża (od 2026-10-15).
//
// Pogoda (niebo, opady, wiatr, dzień/noc, temperatura z prognozy) od 2026-10-15: pobiera ją sterownik włącznika
// z Open-Meteo z domowego łącza (Open-Meteo liczy limit zapytań na adres IP, a Render dzieli adres z innymi usługami —
// w lipcu 2026 pobieranie z serwera nie działało; włącznik, bo nie każdy dom będzie miał sterownik co) dla
// WEATHER_LOCATION, które serwer podaje w odpowiedzi POST /switch/state (weather_query), i wysyła w zgłoszeniu stanu
// (pole weather). Tylko w pamięci; starsza niż WEATHER_MAX_AGE_MS jest pomijana.

export const OUTDOOR_MAX_AGE_MS = 15 * 60 * 1000;
export const WEATHER_MAX_AGE_MS = 45 * 60 * 1000;
// dom: ul. Jana Pawła II, Biały Dunajec (zweryfikowane w OpenStreetMap 2026-10-14); przy kontach użytkowników
// położenie z adresu albo miejscowości
export const WEATHER_LOCATION = { lat: 49.374298, lon: 20.007237 };

let outdoor: { value: number; at: Date } | null = null;

// Nowy pomiar z czujnika kotła (moduł pellet-boiler-pelux200); starszy niż zapamiętany jest pomijany.
export function setOutdoorTemperature(value: number, at = new Date()) {
  if (!Number.isFinite(value)) return;
  if (outdoor && outdoor.at > at) return;
  outdoor = { value, at };
}

/** bieżące warunki z Open-Meteo: temperatura z prognozy [°C], kod WMO, zachmurzenie [%], opad i deszcz [mm],
 *  śnieg [cm] z ostatniego kwadransa, wiatr [km/h] */
export type Weather = {
  temperature: number; code: number; cloudCover: number; precipitation: number; rain: number; snowfall: number;
  windSpeed: number; isDay: boolean; at: string;
};

let weather: (Omit<Weather, 'at'> & { at: Date }) | null = null;

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

// Pole weather ze zgłoszenia sterownika {temp, code, cloud, precip, rain, snow, wind, day, age_s}; błędne jest pomijane.
export function setWeatherFromController(input: unknown, now = new Date()) {
  const value = (input ?? {}) as Record<string, unknown>;
  const keys = ['temp', 'code', 'cloud', 'precip', 'rain', 'snow', 'wind', 'day', 'age_s'];
  if (!input || typeof input !== 'object' || !keys.every((key) => isNumber(value[key]))) return;
  const ageS = Math.max(0, value.age_s as number);
  const at = new Date(now.getTime() - ageS * 1000);
  if (weather && weather.at > at) return;
  weather = {
    temperature: value.temp as number, code: Math.round(value.code as number), cloudCover: value.cloud as number,
    precipitation: value.precip as number, rain: value.rain as number, snowfall: value.snow as number,
    windSpeed: value.wind as number, isDay: value.day !== 0, at,
  };
}

// Ostatnia świeża pogoda albo null.
export function getWeather(now = new Date()): Weather | null {
  if (!weather || now.getTime() - weather.at.getTime() > WEATHER_MAX_AGE_MS) return null;
  return { ...weather, at: weather.at.toISOString() };
}

// Temperatura zewnętrzna i jej źródło: czujnik kotła, a bez świeżego pomiaru prognoza Open-Meteo; null = brak obu.
export function getOutdoor(now = new Date()): { temperature: number; source: 'boiler' | 'forecast' } | null {
  if (outdoor && now.getTime() - outdoor.at.getTime() <= OUTDOOR_MAX_AGE_MS) return { temperature: outdoor.value, source: 'boiler' };
  const forecast = getWeather(now);
  return forecast ? { temperature: forecast.temperature, source: 'forecast' } : null;
}

// Ostatni świeży pomiar (czujnik kotła albo prognoza) albo null.
export function getTemperature(now = new Date()): number | null {
  return getOutdoor(now)?.temperature ?? null;
}
