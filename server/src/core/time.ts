import { addDays } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';

// Wszystkie daty użytkownika (dni, miesiące, harmonogramy) są w czasie polskim.
export const TIME_ZONE = 'Europe/Warsaw';

// Doba czasu warszawskiego jako zakres UTC [startUTC, endUTC).
// Przyjmuje YYYY-MM-DD albo YYYY.MM.DD (format z co).
export function warsawDayBoundsUTC(dateStr: string) {
  const norm = dateStr.replace(/\./g, '-');
  const startLocal = new Date(`${norm}T00:00:00`);
  const endLocal = addDays(startLocal, 1);

  const startUTC = fromZonedTime(startLocal, TIME_ZONE);
  const endUTC = fromZonedTime(endLocal, TIME_ZONE);
  return { startUTC, endUTC };
}

// Kolejne dni od startDate do endDate włącznie, jako zakres UTC [startUTC, endUTC).
export function warsawDateRangeBoundsUTC(startDate: string, endDate: string) {
  const { startUTC } = warsawDayBoundsUTC(startDate);
  const { endUTC } = warsawDayBoundsUTC(endDate);
  return { startUTC, endUTC };
}
