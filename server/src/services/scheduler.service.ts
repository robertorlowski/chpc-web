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
import { clearManualOperation, replaceOperationData, switchManualWorkMode } from './operation.service';
import { getLocalDayOfWeek, isPolishDayOff, TIME_ZONE } from './calendar.service';

export const SCHEDULER_INTERVAL_MS = 60 * 1000;

const previousScheduleState = new Map<string, boolean>();
const previousSchedulerDay = new Map<string, string>();

// Tryb pracy z ustawień harmonogramu wybiera rodzaj harmonogramów, które działają:
// A (CO Harmonogram) -> CO, CWU (CWU Harmonogram) -> CWU, pozostałe -> żaden.
// OFF działa w obu trybach harmonogramu jako przerwa.
export function scheduleTypesForWorkMode(workMode: string | undefined): ScheduleType[] {
  if (workMode === 'A') return [ScheduleType.CO, ScheduleType.OFF];
  if (workMode === 'CWU') return [ScheduleType.CWU, ScheduleType.OFF];
  return [];
}

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

// Data jednorazowa ma pierwszeństwo przed harmonogramem cyklicznym, a przerwa OFF przed CO/CWU.
function scheduleScore(schedule: ScheduleEntry): number {
  return (schedule.date ? 10 : 0) + (schedule.type === ScheduleType.OFF ? 1 : 0);
}

function getActiveSchedule(
  schedules: ScheduleEntry[],
  types: ScheduleType[],
  now: Date,
): ScheduleEntry | undefined {
  return schedules
    .filter((schedule) => types.includes(schedule.type) && isScheduleActive(schedule, now))
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
    // Nie z telemetrii: sterownik raportuje w niej tryb dostany od serwera (po
    // restarcie domyślne OFF), więc serwer odsyłałby mu jego własny stan.
    work_mode: properties.work_mode ?? 'CWU',
    force: '0',
    co_min: stringValue(properties.co_min) ?? stringValue(lastData.co_min),
    co_max: stringValue(properties.co_max) ?? stringValue(lastData.co_max),
    cwu_min: stringValue(properties.cwu_min) ?? stringValue(lastData.cwu_min),
    cwu_max: stringValue(properties.cwu_max) ?? stringValue(lastData.cwu_max),
  };
}

// Poza harmonogramem włączona pompa grzeje CWU, także w trybie CO Harmonogram.
// M (ręczny) i OFF zostają bez zmian.
function withoutSchedule(defaultOperation: OperationEntry): OperationEntry {
  return defaultOperation.work_mode === 'A'
    ? { ...defaultOperation, work_mode: 'CWU' }
    : defaultOperation;
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

// Harmonogram, który działa teraz (dla zakładki Harmonogramy); null = obowiązuje ustawienie domyślne.
export async function getCurrentSchedule(
  rootId: string,
  now = new Date(),
): Promise<{ scheduleId: string | null; work_mode: string }> {
  const device = await DeviceModel.findById(rootId)
    .select('schedules properties')
    .lean<DeviceDocument>();

  if (!device) {
    throw new Error(`Configuration with ID not found: ${rootId}`);
  }

  const workMode = device.properties?.work_mode ?? 'CWU';
  const activeSchedule = getActiveSchedule(
    device.schedules ?? [],
    scheduleTypesForWorkMode(workMode),
    now,
  );

  return {
    scheduleId: activeSchedule?._id ? String(activeSchedule._id) : null,
    work_mode: workMode,
  };
}

export async function runSchedulerOnce(now = new Date()): Promise<void> {
  const devices = await DeviceModel
    .find({ deviceType: DeviceType.HP })
    .select('_id schedules properties deviceType deviceId')
    .lean<DeviceDocument[]>();

  for (const device of devices) {
    const rootId = String(device._id);

    // Po północy (Warszawa) tryb ręczny M wraca na automatyczny A: w ustawieniach
    // harmonogramu i w ręcznym nadpisaniu. Pierwszy przebieg po starcie serwera nie przełącza.
    const today = formatInTimeZone(now, TIME_ZONE, 'yyyy-MM-dd');
    const previousDay = previousSchedulerDay.get(rootId);
    previousSchedulerDay.set(rootId, today);
    if (previousDay && previousDay !== today) {
      if (device.properties?.work_mode === 'M') {
        await DeviceModel.updateOne({ _id: device._id }, { 'properties.work_mode': 'A' });
        device.properties.work_mode = 'A';
      }
      switchManualWorkMode(rootId, 'M', 'A');
    }

    const lastData = await getHpLastData(rootId);
    const defaultOperation = getDefaultOperation(device, lastData);
    const activeSchedule = getActiveSchedule(
      device.schedules ?? [],
      scheduleTypesForWorkMode(stringValue(defaultOperation.work_mode)),
      now,
    );

    const hasActiveSchedule = Boolean(activeSchedule);
    if (previousScheduleState.get(rootId) === true && !hasActiveSchedule) {
      clearManualOperation(rootId);
    }
    previousScheduleState.set(rootId, hasActiveSchedule);

    const operation = activeSchedule
      ? scheduleToOperation(activeSchedule, defaultOperation)
      : withoutSchedule(defaultOperation);

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
