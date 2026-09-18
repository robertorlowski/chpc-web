
import { DeviceType, ScheduleEntry, WeekDay } from '../middleware/type';
import { DeviceDocument, DeviceModel } from '../models/model';
import { getDeviceById } from './device.service';
import { getLocalDayOfWeek, isPolishDayOff } from './calendar.service';


export async function saveSchedule(
  rootId: string,
  input: ScheduleEntry
): Promise<ScheduleEntry> {
  const schedule: ScheduleEntry = {
    dayOfWeek: input.dayOfWeek,
    date: input.date
      ? new Date(input.date)
      : undefined,

    startTime: input.startTime,
    endTime: input.endTime,

    type: input.type,

    enabled: input.enabled ?? true,
    forceStart: input.forceStart ?? false,

    minTemperature: input.minTemperature,
    maxTemperature: input.maxTemperature,
  };

  const root: DeviceDocument | null = await DeviceModel.findById(rootId)
    .select('schedules');
  
  if (!root) {
    throw new Error(`Configuration with ID not found: ${rootId}`);
  }
  
  if (!root.schedules) root.schedules = [];
  root.schedules.push(schedule); 
  await root.save();

  return schedule;
}

export async function getSchedules(
  rootId: string,
): Promise<ScheduleEntry[]> {
  const root = await DeviceModel.findById(rootId)
    .select('schedules')
    .lean<DeviceDocument>();

  if (!root) {
     throw new Error(`Configuration with ID not found: ${rootId}`);
  }
  return root?.schedules ?? [];
}

export async function updateSchedule(
  rootId: string,
  scheduleId: string,
  input: ScheduleEntry,
): Promise<ScheduleEntry> {
  const root = await DeviceModel.findById(rootId)
    .select('schedules');

  if (!root) {
    throw new Error(`Configuration with ID not found: ${rootId}`);
  }

  const schedules = root.schedules ?? [];
  const index = schedules.findIndex((schedule) => schedule._id?.toString() === scheduleId);
  if (index < 0) {
    throw new Error(`Schedule with ID not found: ${scheduleId}`);
  }

  const current = schedules[index];
  const updated: ScheduleEntry = {
    ...current,
    dayOfWeek: input.dayOfWeek,
    date: input.date ? new Date(input.date) as any : undefined,
    startTime: input.startTime,
    endTime: input.endTime,
    type: input.type,
    enabled: input.enabled ?? current.enabled,
    forceStart: input.forceStart ?? false,
    minTemperature: input.minTemperature,
    maxTemperature: input.maxTemperature,
  };

  schedules[index] = updated;
  root.schedules = schedules;
  await root.save();

  return updated;
}

export async function deleteSchedule(
  rootId: string,
  scheduleId: string,
): Promise<void> {
  const result = await DeviceModel.updateOne(
    { _id: rootId },
    { $pull: { schedules: { _id: scheduleId } } },
  );

  if (result.matchedCount === 0) {
    throw new Error(`Configuration with ID not found: ${rootId}`);
  }
}

function getStartOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);

  return result;
}

function getEndOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);

  return result;
}

export async function getSchedulesForDate(
  rootId: string,
  selectedDate: Date,
): Promise<ScheduleEntry[]> {
  const root = await DeviceModel.findById(rootId)
    .select('schedules')
    .lean<DeviceDocument>();

  if (!root) {
    throw new Error(`Configuration with ID not found: ${rootId}`);
  }

  const schedules = root?.schedules ?? [];
  const dayOfWeek = getLocalDayOfWeek(selectedDate) as WeekDay;
  const dayOff = isPolishDayOff(selectedDate);

  const startOfDay = getStartOfDay(selectedDate);
  const endOfDay = getEndOfDay(selectedDate);

  const schedulesForSpecificDate = schedules.filter(
    (schedule) =>
      schedule.enabled &&
      schedule.date &&
      new Date(schedule.date) >= startOfDay &&
      new Date(schedule.date) <= endOfDay,
  );

  const schedulesForWeekDay = schedules.filter(
    (schedule) =>
      schedule.enabled &&
      !schedule.date &&
      (schedule.dayOfWeek === dayOfWeek ||
        schedule.dayOfWeek === WeekDay.ANY_DAY ||
        (schedule.dayOfWeek === WeekDay.WORKDAYS
          && dayOfWeek >= WeekDay.MONDAY
          && dayOfWeek <= WeekDay.FRIDAY
          && !dayOff) ||
        (schedule.dayOfWeek === WeekDay.DAYS_OFF && dayOff)),
  );

  return [
    ...schedulesForSpecificDate,
    ...schedulesForWeekDay,
  ].sort((first: ScheduleEntry, second: ScheduleEntry) => {
    if ( !!first.date && !!second.date && first.date  !== second.date) {
      return new Date(second.date).getTime() - new Date(first.date).getTime();
    }

    return first.startTime.localeCompare(second.startTime);
  });
}
