// Harmonogramy włącznika: okna czasowe (który wpis działa teraz, kiedy się kończy,
// kiedy następne włączenie) i CRUD kolekcji switch_schedules. Czas w Europe/Warsaw.
// Okno przez północ (np. pon 22:00–06:00) należy do dnia, w którym się zaczyna:
// trwa od poniedziałku 22:00 do wtorku 06:00 (inaczej niż w schedulerze pompy).
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { WeekDay } from '../../../core/types';
import { scheduleDayMatches } from '../../../core/services/calendar.service';
import { TIME_ZONE } from '../../../core/time';
import { SwitchScheduleModel } from '../models/switch-schedule.model';
import { SwitchSchedule, timePattern } from '../types';

type ScheduleWindowSource = Pick<SwitchSchedule, 'enabled' | 'dayOfWeek' | 'date' | 'startTime' | 'endTime'> & { _id?: unknown };

const WEEK_DAYS = Object.values(WeekDay).filter((value) => typeof value === 'number') as number[];

// YYYY-MM-DD przesunięte o days dni (daty kalendarzowe, bez stref)
const shiftDate = (localDate: string, days: number) => {
  const date = new Date(`${localDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

// godzina HH:mm dnia localDate w Warszawie jako chwila UTC
const warsawTime = (localDate: string, time: string) => fromZonedTime(`${localDate}T${time}:00`, TIME_ZONE);

// Okno wpisu zaczynające się w dniu localDate albo null, gdy wpis tego dnia nie działa.
// startTime = endTime oznacza puste okno (jak w pompie: koniec jest wyłączny).
export function scheduleWindow(schedule: ScheduleWindowSource, localDate: string): { start: Date; end: Date } | null {
  if (!schedule.enabled || schedule.startTime === schedule.endTime) return null;
  if (!scheduleDayMatches(schedule, localDate)) return null;
  const start = warsawTime(localDate, schedule.startTime);
  const endDate = schedule.startTime < schedule.endTime ? localDate : shiftDate(localDate, 1);
  return { start, end: warsawTime(endDate, schedule.endTime) };
}

// Okno wpisu obejmujące chwilę now (dzisiejsze albo wczorajsze przez północ).
function windowAt(schedule: ScheduleWindowSource, now: Date) {
  const today = formatInTimeZone(now, TIME_ZONE, 'yyyy-MM-dd');
  for (const localDate of [today, shiftDate(today, -1)]) {
    const window = scheduleWindow(schedule, localDate);
    if (window && window.start <= now && now < window.end) return window;
  }
  return null;
}

// Wpis działający w chwili now i koniec włączenia. Okna, które się stykają albo
// nakładają (06:00–07:00 i 07:00–08:00), są łączone: until to koniec ostatniego,
// więc sterownik dostaje jeden ciągły czas pracy.
export function activeSchedule(
  schedules: ScheduleWindowSource[],
  now: Date,
): { scheduleId: string | null; until: Date } | null {
  let first: { scheduleId: string | null; until: Date } | null = null;
  let moment = now;
  // najwyżej kilkanaście połączeń: wpisy z całego tygodnia i tak by się powtarzały
  for (let step = 0; step < 16; step += 1) {
    const active = schedules
      .map((schedule) => ({ schedule, window: windowAt(schedule, moment) }))
      .filter((item) => item.window !== null)
      .sort((a, b) => b.window!.end.getTime() - a.window!.end.getTime());
    if (active.length === 0) break;
    const end = active[0].window!.end;
    if (!first) {
      first = { scheduleId: active[0].schedule._id ? String(active[0].schedule._id) : null, until: end };
    } else if (end <= first.until) {
      break;
    } else {
      first.until = end;
    }
    moment = end;
  }
  return first;
}

// Najbliższe włączenie z harmonogramu po chwili now (w ciągu 8 dni), do podpowiedzi
// „następne włączenie” w aplikacji.
export function nextScheduleStart(schedules: ScheduleWindowSource[], now: Date): Date | null {
  const today = formatInTimeZone(now, TIME_ZONE, 'yyyy-MM-dd');
  let next: Date | null = null;
  for (let day = 0; day <= 8; day += 1) {
    const localDate = shiftDate(today, day);
    for (const schedule of schedules) {
      const window = scheduleWindow(schedule, localDate);
      if (window && window.start > now && (!next || window.start < next)) next = window.start;
    }
    if (next) break;
  }
  return next;
}

// Wpis z żądania: numer przekaźnika, godziny, dzień tygodnia albo data. Błąd = komunikat.
export function parseSchedule(body: unknown, relayCount: number): Omit<SwitchSchedule, 'rootId'> | string {
  const input = (body ?? {}) as Record<string, unknown>;
  const relay = input.relay;
  if (typeof relay !== 'number' || !Number.isInteger(relay) || relay < 1 || relay > relayCount) {
    return `relay: numer przekaźnika 1–${relayCount}.`;
  }
  if (typeof input.startTime !== 'string' || !timePattern.test(input.startTime)
    || typeof input.endTime !== 'string' || !timePattern.test(input.endTime)) {
    return 'startTime i endTime w formacie HH:mm.';
  }
  let date: Date | undefined;
  if (input.date !== undefined && input.date !== null && input.date !== '') {
    date = new Date(String(input.date));
    if (Number.isNaN(date.getTime())) return 'Nieprawidłowa data.';
  }
  const dayOfWeek = input.dayOfWeek;
  if (!date && (typeof dayOfWeek !== 'number' || !WEEK_DAYS.includes(dayOfWeek))) {
    return 'Podaj dayOfWeek (-3…6) albo date.';
  }
  return {
    relay,
    enabled: input.enabled !== false,
    dayOfWeek: date ? undefined : dayOfWeek as WeekDay,
    date,
    startTime: input.startTime,
    endTime: input.endTime,
  };
}

export async function listSchedules(rootId: string) {
  return SwitchScheduleModel.find({ rootId }).sort({ relay: 1, startTime: 1 }).lean();
}

export async function createSchedule(rootId: string, schedule: Omit<SwitchSchedule, 'rootId'>) {
  return SwitchScheduleModel.create({ ...schedule, rootId });
}

// Pełna podmiana wpisu: pominięta data albo dzień tygodnia są czyszczone.
export async function replaceSchedule(rootId: string, id: string, schedule: Omit<SwitchSchedule, 'rootId'>) {
  return SwitchScheduleModel.findOneAndReplace({ _id: id, rootId }, { ...schedule, rootId }, { new: true }).lean();
}

export async function removeSchedule(rootId: string, id: string) {
  const result = await SwitchScheduleModel.deleteOne({ _id: id, rootId });
  return result.deletedCount > 0;
}
