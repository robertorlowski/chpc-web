import { formatInTimeZone } from 'date-fns-tz';
import {
  DeviceType,
  HpEntry,
  OperationEntry,
  ScheduleEntry,
  ScheduleType,
  WeekDay,
} from '../middleware/type';
import { DeviceDocument, DeviceModel } from '../models/model';
import { getHpLastData } from './hp.service';
import { clearManualOperation, replaceOperationData } from './operation.service';
import { getLocalDayOfWeek, isPolishDayOff, TIME_ZONE } from './calendar.service';

export const SCHEDULER_INTERVAL_MS = 60 * 1000;

const previousScheduleState = new Map<string, boolean>();

const scheduleTypePriority: Record<ScheduleType, number> = {
  [ScheduleType.OFF]: 300,
  [ScheduleType.CO]: 200,
  [ScheduleType.CWU]: 100,
};

function toMinutes(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function isScheduleForToday(schedule: ScheduleEntry, now: Date): boolean {
  const localDate = formatInTimeZone(now, TIME_ZONE, 'yyyy-MM-dd');

  if (schedule.date) {
    return formatInTimeZone(new Date(schedule.date), TIME_ZONE, 'yyyy-MM-dd') === localDate;
  }

  const dayOfWeek = getLocalDayOfWeek(now) as WeekDay;
  const dayOff = isPolishDayOff(now);

  return schedule.dayOfWeek === WeekDay.ANY_DAY
    || schedule.dayOfWeek === dayOfWeek
    || (
      schedule.dayOfWeek === WeekDay.WORKDAYS
      && dayOfWeek >= WeekDay.MONDAY
      && dayOfWeek <= WeekDay.FRIDAY
      && !dayOff
    )
    || (schedule.dayOfWeek === WeekDay.DAYS_OFF && dayOff);
}

function isScheduleActive(schedule: ScheduleEntry, now: Date): boolean {
  if (!schedule.enabled || !isScheduleForToday(schedule, now)) return false;

  const current = toMinutes(formatInTimeZone(now, TIME_ZONE, 'HH:mm'));
  const start = toMinutes(schedule.startTime);
  const end = toMinutes(schedule.endTime);

  if (start <= end) {
    return current >= start && current < end;
  }

  // Zakres przechodzący przez północ, np. 22:00-06:00.
  return current >= start || current < end;
}

function scheduleScore(schedule: ScheduleEntry): number {
  const datePriority = schedule.date ? 1000 : 0;
  const typePriority = scheduleTypePriority[schedule.type] ?? 0;

  return datePriority + typePriority;
}

function getActiveSchedule(
  schedules: ScheduleEntry[],
  now: Date,
): ScheduleEntry | undefined {
  return schedules
    .filter((schedule) => isScheduleActive(schedule, now))
    .sort((first, second) => {
      const scoreDifference = scheduleScore(second) - scheduleScore(first);
      if (scoreDifference !== 0) return scoreDifference;

      const startDifference = second.startTime.localeCompare(first.startTime);
      if (startDifference !== 0) return startDifference;

      return String(second._id ?? '').localeCompare(String(first._id ?? ''));
    })[0];
}

function stringValue(value: unknown): string | undefined {
  return value === undefined || value === null ? undefined : String(value);
}

function getDefaultOperation(
  device: DeviceDocument,
  lastData: HpEntry,
): OperationEntry {
  const properties = device.properties ?? {};

  return {
    work_mode: properties.work_mode ?? stringValue(lastData.work_mode) ?? 'CWU',
    force: '0',
    co_min: stringValue(properties.co_min) ?? stringValue(lastData.co_min),
    co_max: stringValue(properties.co_max) ?? stringValue(lastData.co_max),
    cwu_min: stringValue(properties.cwu_min) ?? stringValue(lastData.cwu_min),
    cwu_max: stringValue(properties.cwu_max) ?? stringValue(lastData.cwu_max),
  };
}

function scheduleToOperation(
  schedule: ScheduleEntry,
  defaultOperation: OperationEntry,
): OperationEntry {
  const force = schedule.forceStart ? '1' : '0';
  switch (schedule.type) {
    case ScheduleType.OFF:
      return {
        ...defaultOperation,
        work_mode: 'OFF',
        force: '0',
      };

    case ScheduleType.CO:
      return {
        ...defaultOperation,
        work_mode: 'A',
        force,
        co_min: schedule.minTemperature === undefined
          ? defaultOperation.co_min
          : String(schedule.minTemperature),
        co_max: schedule.maxTemperature === undefined
          ? defaultOperation.co_max
          : String(schedule.maxTemperature),
      };

    case ScheduleType.CWU:
      return {
        ...defaultOperation,
        work_mode: 'CWU',
        force,
        cwu_min: schedule.minTemperature === undefined
          ? defaultOperation.cwu_min
          : String(schedule.minTemperature),
        cwu_max: schedule.maxTemperature === undefined
          ? defaultOperation.cwu_max
          : String(schedule.maxTemperature),
      };
  }
}

export async function runSchedulerOnce(now = new Date()): Promise<void> {
  const devices = await DeviceModel
    .find({ deviceType: DeviceType.HP })
    .select('_id schedules properties deviceType deviceId')
    .lean<DeviceDocument[]>();

  for (const device of devices) {
    const rootId = String(device._id);
    const lastData = await getHpLastData(rootId);
    const defaultOperation = getDefaultOperation(device, lastData);
    const activeSchedule = getActiveSchedule(device.schedules ?? [], now);

    const hasActiveSchedule = Boolean(activeSchedule);
    if (previousScheduleState.get(rootId) === true && !hasActiveSchedule) {
      clearManualOperation(rootId);
    }
    previousScheduleState.set(rootId, hasActiveSchedule);

    const operation = activeSchedule
      ? scheduleToOperation(activeSchedule, defaultOperation)
      : defaultOperation;

    // Sterownik pobiera OperationEntry przy zapisie telemetrii.
    // Scheduler celowo nie wysyła powiadomienia przez WebSocket.
    replaceOperationData(rootId, operation);

    console.log(`[scheduler] ${rootId}`, operation);
  }
}

export function startScheduler(): NodeJS.Timeout {
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;

    try {
      await runSchedulerOnce();
    } catch (error) {
      console.error('[scheduler] error:', error);
    } finally {
      running = false;
    }
  };

  void tick();
  return setInterval(() => void tick(), SCHEDULER_INTERVAL_MS);
}
