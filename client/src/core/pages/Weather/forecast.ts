// Dane strony pogody (pages/Weather) pobierane przez przeglądarkę wprost z Open-Meteo (serwer na Render dzieli adres
// IP z innymi usługami i Open-Meteo odrzucało jego zapytania): prognoza (jedno zapytanie dla wszystkich zakładek,
// z 31 dniami wstecz do dopasowania prognozy PV do produkcji z DTU) i jakość powietrza (osobny serwis, zakładka
// „Powietrze”). Czasy są lokalne (timezone=Europe/Warsaw) w postaci „2026-10-17T22:00”.

const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const AIR = 'https://air-quality-api.open-meteo.com/v1/air-quality';
export const PAST_DAYS = 31;
export const FORECAST_DAYS = 16;
// nasłonecznienie liczone na panel skierowany na południe (azymut 0 w Open-Meteo) pod kątem 35°; różnicę
// względem prawdziwej instalacji zbiera współczynnik dopasowania do produkcji (SunTab)
export const PANEL_TILT = 35;
export const PANEL_AZIMUTH = 0;

export type Forecast = {
  utc_offset_seconds: number;
  current: {
    time: string; temperature_2m: number; apparent_temperature: number; weather_code: number; is_day: number;
    relative_humidity_2m: number; wind_speed_10m: number; wind_direction_10m: number; wind_gusts_10m: number; pressure_msl: number;
  };
  hourly: {
    time: string[]; temperature_2m: number[]; weather_code: number[]; precipitation_probability: (number | null)[]; is_day: number[];
    wind_speed_10m: number[]; wind_gusts_10m: number[]; wind_direction_10m: number[]; global_tilted_irradiance: (number | null)[];
  };
  daily: {
    time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[]; temperature_2m_mean: number[];
    precipitation_probability_max: (number | null)[]; precipitation_sum: number[]; snowfall_sum: number[];
    wind_gusts_10m_max: number[]; wind_direction_10m_dominant: number[]; sunrise: string[]; sunset: string[];
    daylight_duration: number[]; uv_index_max: (number | null)[];
  };
};

export type AirQuality = {
  current: { time: string; european_aqi: number | null; pm2_5: number | null; pm10: number | null; nitrogen_dioxide: number | null; ozone: number | null };
  hourly: {
    time: string[]; european_aqi: (number | null)[]; alder_pollen: (number | null)[]; birch_pollen: (number | null)[];
    grass_pollen: (number | null)[]; mugwort_pollen: (number | null)[]; ragweed_pollen: (number | null)[];
  };
};

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

export const fetchForecast = (lat: number, lon: number) => getJson<Forecast>(`${FORECAST}?${new URLSearchParams({
  latitude: String(lat), longitude: String(lon), timezone: 'Europe/Warsaw', past_days: String(PAST_DAYS), forecast_days: String(FORECAST_DAYS),
  tilt: String(PANEL_TILT), azimuth: String(PANEL_AZIMUTH),
  current: 'temperature_2m,apparent_temperature,weather_code,is_day,relative_humidity_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl',
  hourly: 'temperature_2m,weather_code,precipitation_probability,is_day,wind_speed_10m,wind_gusts_10m,wind_direction_10m,global_tilted_irradiance',
  daily: 'weather_code,temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_probability_max,precipitation_sum,snowfall_sum,'
    + 'wind_gusts_10m_max,wind_direction_10m_dominant,sunrise,sunset,daylight_duration,uv_index_max',
})}`);

export const fetchAirQuality = (lat: number, lon: number) => getJson<AirQuality>(`${AIR}?${new URLSearchParams({
  latitude: String(lat), longitude: String(lon), timezone: 'Europe/Warsaw', forecast_days: '2',
  current: 'european_aqi,pm2_5,pm10,nitrogen_dioxide,ozone',
  hourly: 'european_aqi,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,ragweed_pollen',
})}`);

export const hourOf = (time: string) => time.slice(11, 16);
export const dayOf = (time: string) => time.slice(0, 10);
export const nextDay = (day: string) => {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
};
export const weekday = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('pl-PL', { weekday: 'short', timeZone: 'UTC' });
export const shortDate = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}`;
export const deg = (value: number) => `${Math.round(value)}°`;
export const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
export const number1 = (value: number) => value.toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const WIND_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const windDirection = (degrees: number) => WIND_DIRECTIONS[Math.round(degrees / 45) % 8];

// Indeksy dnia dzisiejszego (w daily) i pierwszej godziny po bieżącej chwili (w hourly).
export function todayIndex(forecast: Forecast) {
  return Math.max(0, forecast.daily.time.indexOf(dayOf(forecast.current.time)));
}
export function nextHourIndex(forecast: Forecast) {
  return Math.max(0, forecast.hourly.time.findIndex((time) => time > forecast.current.time));
}

// „dziś”, „jutro” albo skrót dnia tygodnia z datą
export function dayLabel(forecast: Forecast, day: string) {
  const today = dayOf(forecast.current.time);
  if (day === today) return 'dziś';
  if (day === nextDay(today)) return 'jutro';
  return `${weekday(day)} ${shortDate(day)}`;
}

// Chwila (Date) dla lokalnego czasu Open-Meteo. Przesunięcie strefy jest z chwili pobrania, więc w noc zmiany
// czasu godziny po zmianie są przesunięte o godzinę (dotyczy tylko stref G12w w zakładce „Ogrzewanie”).
export const instantOf = (forecast: Forecast, time: string) => new Date(Date.parse(`${time}:00Z`) - forecast.utc_offset_seconds * 1000);

// Ikona nocy dla dnia: najgorszy kod pogody z godzin 21:00–05:00 (kody WMO rosną z nasileniem zjawiska).
export function nightCode(forecast: Forecast, day: string): number | null {
  const from = `${day}T21:00`;
  const to = `${nextDay(day)}T06:00`;
  let worst: number | null = null;
  forecast.hourly.time.forEach((time, index) => {
    if (time >= from && time < to) worst = Math.max(worst ?? 0, forecast.hourly.weather_code[index]);
  });
  return worst;
}
