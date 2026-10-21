// Formaty zależne od języka (core/i18n): wiek danych („8 s”, „5 min”, „3 h”, „2 dni”), chwila względem dziś
// („dziś 14:32”, „wczoraj 21:14”, „jutro 06:00”, inaczej „08.10 09:12”; jak formatWhen na serwerze, czas warszawski),
// data i godzina w Intl z bieżącym językiem. Używane przez kafelki listy, pasek offline i strony core.
import { getLang, Lang, locale, translate } from './index';

const TIME_ZONE = 'Europe/Warsaw';

// „8 s”, „5 min”, „3 h”, „2 dni” — wiek danych w stopce kafelka (używane też w OfflineBanner)
export function ageLabel(ms: number, lang: Lang = getLang()): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h` : translate(lang, 'age.days', { n: Math.round(hours / 24) });
}

const warsawDay = (date: Date) => date.toLocaleDateString('en-CA', { timeZone: TIME_ZONE });
export const warsawTime = (date: Date | string | number, lang: Lang = getLang()) =>
  new Date(date).toLocaleTimeString(locale(lang), { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' });

// „dziś 14:32”, „wczoraj 21:14”, „jutro 06:00”, w pozostałych przypadkach „08.10 09:12”
export function whenLabel(value: Date | string | number, now: number | Date = Date.now(), lang: Lang = getLang()): string {
  const date = new Date(value);
  const current = new Date(now);
  const day = warsawDay(date);
  const time = warsawTime(date, lang);
  if (day === warsawDay(current)) return translate(lang, 'when.today', { time });
  if (day === warsawDay(new Date(current.getTime() - 86_400_000))) return translate(lang, 'when.yesterday', { time });
  if (day === warsawDay(new Date(current.getTime() + 86_400_000))) return translate(lang, 'when.tomorrow', { time });
  const [, month, dayOfMonth] = day.split('-');
  return `${dayOfMonth}.${month} ${time}`;
}

export const dateTimeLabel = (value: string | number | Date | undefined, lang: Lang = getLang(), fallback = '---') =>
  value ? new Date(value).toLocaleString(locale(lang), { dateStyle: 'short', timeStyle: 'short' }) : fallback;

export const dateLabel = (value: string | number | Date | undefined, lang: Lang = getLang(), fallback = '---') =>
  value ? new Date(value).toLocaleDateString(locale(lang)) : fallback;

export const number = (value: number, digits = 0, lang: Lang = getLang()) =>
  value.toLocaleString(locale(lang), { maximumFractionDigits: digits, minimumFractionDigits: 0 });

export const number1 = (value: number, lang: Lang = getLang()) =>
  value.toLocaleString(locale(lang), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
