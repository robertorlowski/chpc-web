// Formaty tekstów kafelków sterowników (GET /devices/summary): liczby po polsku, czasy w Warszawie.
import { TIME_ZONE } from '../time';

const number = (value: number, digits = 0) =>
  value.toLocaleString('pl-PL', { maximumFractionDigits: digits, minimumFractionDigits: 0 });

export const formatUnit = (value: number | undefined | null, unit: string, digits = 0) =>
  typeof value === 'number' && Number.isFinite(value) ? `${number(value, digits)} ${unit}`.trim() : '---';

export const formatTemperature = (value: number | undefined | null) => formatUnit(value, '°C', 1);

// 400 s -> „6 min 40 s”, 3720 s -> „1 h 2 min”
export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  if (total < 60) return `${total} s`;
  if (total < 3600) return `${Math.floor(total / 60)} min${total % 60 ? ` ${total % 60} s` : ''}`;
  return `${Math.floor(total / 3600)} h${Math.floor((total % 3600) / 60) ? ` ${Math.floor((total % 3600) / 60)} min` : ''}`;
}

const warsawDay = (date: Date) => date.toLocaleDateString('en-CA', { timeZone: TIME_ZONE });
export const warsawTime = (date: Date) =>
  date.toLocaleTimeString('pl-PL', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' });

// „dziś 14:32”, „wczoraj 21:14”, „jutro 06:00”, w pozostałych przypadkach „08.10 09:12”
export function formatWhen(date: Date, now = new Date()): string {
  const day = warsawDay(date);
  if (day === warsawDay(now)) return `dziś ${warsawTime(date)}`;
  if (day === warsawDay(new Date(now.getTime() - 24 * 3600 * 1000))) return `wczoraj ${warsawTime(date)}`;
  if (day === warsawDay(new Date(now.getTime() + 24 * 3600 * 1000))) return `jutro ${warsawTime(date)}`;
  const [, month, dayOfMonth] = day.split('-');
  return `${dayOfMonth}.${month} ${warsawTime(date)}`;
}

// Brak łączności albo telemetrii: do godziny to uwaga (pomarańczowa, bo sterownik zwykle wraca sam po restarcie
// albo chwilowym zaniku Wi-Fi), po godzinie błąd (czerwony).
export const OFFLINE_ERROR_AFTER_MS = 60 * 60 * 1000;
export const offlineLevel = (ageMs: number): 'warn' | 'err' => (ageMs > OFFLINE_ERROR_AFTER_MS ? 'err' : 'warn');

// „5 min”, „2 h”, „3 dni” — jak długo trwa brak danych
export function formatAge(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} dni`;
}
