// Bieżąca lokalizacja urządzenia dla kafelka pogody „Moja lokalizacja” (weather_tiles.current, od 2026-10-17):
// położenie z przeglądarki (navigator.geolocation: telefon GPS, komputer Wi-Fi / adres IP), nazwa miejscowości z
// BigDataCloud (darmowy serwis do wywołań z przeglądarki, bez klucza) i bieżąca pogoda z Open-Meteo. Nic z tego nie
// trafia na serwer: każde urządzenie pokazuje pogodę tam, gdzie jest. Ostatni wynik zostaje w localStorage
// (chpc.currentPlace), więc kafelek rysuje się od razu, a odświeża co 15 min. Jeden wspólny stan dla wszystkich
// użyć (kafelek i strona pogody) z jednym zapytaniem naraz. Przeglądarka daje położenie tylko przez HTTPS albo localhost.
import { useEffect, useState } from 'react';
import { getLang } from './i18n';
import { Weather } from './types';

const KEY = 'chpc.currentPlace';
const EVENT = 'chpc-current-place';
const REFRESH_MS = 15 * 60 * 1000;
// nazwa miejscowości pobierana ponownie dopiero po przesunięciu o tyle km
const RENAME_KM = 1;
const GEOCODER = 'https://api.bigdatacloud.net/data/reverse-geocode-client';
const FORECAST = 'https://api.open-meteo.com/v1/forecast';

export type CurrentPlace = { lat: number; lon: number; name: string | null; weather: Weather | null; at: string };
export type CurrentPlaceStatus = 'locating' | 'ok' | 'denied' | 'unavailable' | 'insecure' | 'unsupported';
export type CurrentPlaceState = { status: CurrentPlaceStatus; place: CurrentPlace | null };

function readCache(): CurrentPlace | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) as CurrentPlace : null;
  } catch {
    return null;
  }
}

function writeCache(place: CurrentPlace) {
  try { localStorage.setItem(KEY, JSON.stringify(place)); } catch { /* bez pamięci przeglądarki: tylko w tej sesji */ }
}

let state: CurrentPlaceState = { status: 'locating', place: readCache() };
let inflight: Promise<void> | null = null;

function emit(next: CurrentPlaceState) {
  state = next;
  window.dispatchEvent(new Event(EVENT));
}

const position = () => new Promise<GeolocationPosition>((resolve, reject) =>
  navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 20000, maximumAge: 5 * 60 * 1000 }));

// odległość w km (przybliżenie równoleżnikowe wystarcza do progu 1 km)
function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const x = (b.lon - a.lon) * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
  return Math.hypot(x, b.lat - a.lat) * 111.32;
}

async function placeName(lat: number, lon: number): Promise<string | null> {
  const response = await fetch(`${GEOCODER}?latitude=${lat}&longitude=${lon}&localityLanguage=${getLang()}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.json() as { city?: string; locality?: string; principalSubdivision?: string };
  return body.city || body.locality || body.principalSubdivision || null;
}

async function currentWeather(lat: number, lon: number): Promise<Weather> {
  const response = await fetch(`${FORECAST}?latitude=${lat}&longitude=${lon}&timezone=Europe%2FWarsaw`
    + '&current=temperature_2m,weather_code,cloud_cover,precipitation,rain,snowfall,wind_speed_10m,is_day');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const { current } = await response.json() as { current: Record<string, number> };
  return {
    temperature: current.temperature_2m, code: current.weather_code, cloudCover: current.cloud_cover, precipitation: current.precipitation,
    rain: current.rain, snowfall: current.snowfall, windSpeed: current.wind_speed_10m, isDay: current.is_day === 1, at: new Date().toISOString(),
  };
}

// Odczyt położenia i pogody; force pomija pamięć (świeży wynik młodszy niż 15 min jest używany bez pytania).
export function refreshCurrentPlace(force = false): Promise<void> {
  if (inflight) return inflight;
  const cached = state.place;
  if (!force && state.status === 'ok' && cached && Date.now() - Date.parse(cached.at) < REFRESH_MS) return Promise.resolve();
  if (!('geolocation' in navigator)) { emit({ status: 'unsupported', place: cached }); return Promise.resolve(); }
  if (!window.isSecureContext) { emit({ status: 'insecure', place: cached }); return Promise.resolve(); }
  inflight = (async () => {
    try {
      const { coords } = await position();
      const here = { lat: Math.round(coords.latitude * 1e4) / 1e4, lon: Math.round(coords.longitude * 1e4) / 1e4 };
      const sameArea = cached?.name && distanceKm(cached, here) < RENAME_KM;
      const [name, weather] = await Promise.all([
        sameArea ? Promise.resolve(cached!.name) : placeName(here.lat, here.lon).catch(() => null),
        currentWeather(here.lat, here.lon).catch(() => (sameArea ? cached!.weather : null)),
      ]);
      const place = { ...here, name, weather, at: new Date().toISOString() };
      writeCache(place);
      emit({ status: 'ok', place });
    } catch (error) {
      emit({ status: (error as GeolocationPositionError)?.code === 1 ? 'denied' : 'unavailable', place: cached });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

// Stan bieżącej lokalizacji; active = false nie pyta o położenie (np. konto bez kafelka lokalizacji).
export function useCurrentPlace(active = true): CurrentPlaceState {
  const [value, setValue] = useState(state);
  useEffect(() => {
    if (!active) return undefined;
    const update = () => setValue(state);
    window.addEventListener(EVENT, update);
    update();
    refreshCurrentPlace();
    const timer = window.setInterval(() => refreshCurrentPlace(), REFRESH_MS);
    return () => { window.removeEventListener(EVENT, update); window.clearInterval(timer); };
  }, [active]);
  return value;
}

// opis stanu dla kafelka i strony pogody, gdy nie ma położenia albo odczyt się nie udał (t z useLang, klucze place.*)
export function currentPlaceProblem(status: CurrentPlaceStatus, t: (key: string) => string): string | null {
  switch (status) {
    case 'denied': case 'insecure': case 'unsupported': case 'unavailable': return t(`place.${status}`);
    default: return null;
  }
}
