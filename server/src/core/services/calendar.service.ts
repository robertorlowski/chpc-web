// Kalendarz polski dla harmonogramów pompy i włącznika: dzień tygodnia w czasie
// warszawskim i dni wolne (weekendy + święta ustawowe). Używa go scheduler pompy
// (WORKDAYS, DAYS_OFF), schedule.service i harmonogramy włącznika (scheduleDayMatches).
// Wewnątrz daty świąt liczone są w UTC jako klucze YYYY-MM-DD.
import { formatInTimeZone } from 'date-fns-tz';

import { TIME_ZONE } from '../time';

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

// Niedziela Wielkanocna (kalendarz gregoriański, algorytm Meeusa/Jonesa/Butchera).
function getEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return new Date(Date.UTC(year, month - 1, day));
}

function getPolishPublicHolidays(year: number): Set<string> {
  const holidays = [
    `${year}-01-01`,
    `${year}-01-06`,
    `${year}-05-01`,
    `${year}-05-03`,
    `${year}-08-15`,
    `${year}-11-01`,
    `${year}-11-11`,
    // Wigilia: dzień wolny od 2025 r.; tu dla każdego roku
    `${year}-12-24`,
    `${year}-12-25`,
    `${year}-12-26`,
  ];
  const easterSunday = getEasterSunday(year);

  // Poniedziałek Wielkanocny, Zielone Świątki (niedziela), Boże Ciało
  holidays.push(
    dateKey(addDays(easterSunday, 1)),
    dateKey(addDays(easterSunday, 49)),
    dateKey(addDays(easterSunday, 60)),
  );

  return new Set(holidays);
}

// Dzień tygodnia w Warszawie w numeracji WeekDay/JS: 0 = niedziela ... 6 = sobota.
export function getLocalDayOfWeek(date: Date): number {
  const isoDay = Number(formatInTimeZone(date, TIME_ZONE, 'i'));
  return isoDay === 7 ? 0 : isoDay;
}

// Czy wpis harmonogramu dotyczy dnia localDate (YYYY-MM-DD w Warszawie): data
// jednorazowa ma pierwszeństwo przed dayOfWeek (WeekDay z core/types.ts). Używa go
// włącznik; scheduler pompy ma własną, starszą wersję (dzień chwili bieżącej).
export function scheduleDayMatches(
  schedule: { dayOfWeek?: number; date?: Date | string },
  localDate: string,
): boolean {
  if (schedule.date) {
    return formatInTimeZone(new Date(schedule.date), TIME_ZONE, 'yyyy-MM-dd') === localDate;
  }
  // południe zamiast północy: ta sama data w Warszawie także w dniu zmiany czasu
  const noon = new Date(`${localDate}T10:00:00Z`);
  const dayOfWeek = getLocalDayOfWeek(noon);
  const dayOff = isPolishDayOff(noon);
  switch (schedule.dayOfWeek) {
    case -1: return true; // ANY_DAY
    case -2: return dayOfWeek >= 1 && dayOfWeek <= 5 && !dayOff; // WORKDAYS
    case -3: return dayOff; // DAYS_OFF
    default: return schedule.dayOfWeek === dayOfWeek;
  }
}

// Sobota, niedziela albo święto ustawowo wolne (data liczona w Warszawie).
export function isPolishDayOff(date: Date): boolean {
  const dayOfWeek = getLocalDayOfWeek(date);
  if (dayOfWeek === 0 || dayOfWeek === 6) return true;

  const localDate = formatInTimeZone(date, TIME_ZONE, 'yyyy-MM-dd');
  const year = Number(localDate.slice(0, 4));
  return getPolishPublicHolidays(year).has(localDate);
}
