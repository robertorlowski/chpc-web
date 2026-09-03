
import { DeviceType, ScheduleEntry, WeekDay } from '../middleware/type';
import { DeviceDocument, DeviceModel } from '../models/model';
import { getDeviceById } from './device.service';


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
    deviceEnabled: input.deviceEnabled,

    minTemperature: input.minTemperature,
    maxTemperature: input.maxTemperature,
  };

  const root: DeviceDocument | null = await DeviceModel.findById(rootId)
    .select('schedules')
    .lean<DeviceDocument>();
  
  if (!root) {
    throw new Error(`Configuration with ID not found: ${rootId}`);
  }
  
  root.schedules?.push(schedule); 
  root.save();

  return schedule;
}

export async function getSchedules(
  rootId: string,
): Promise<ScheduleEntry[]> {
  const root = await DeviceModel.findById(rootId)
    .select('settings.schedules')
    .lean<DeviceDocument>();

  if (!root) {
     throw new Error(`Configuration with ID not found: ${rootId}`);
  }
  return root?.schedules ?? [];
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
  const dayOfWeek = selectedDate.getDay() as WeekDay;

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
      schedule.dayOfWeek === dayOfWeek,
  );

  return [
    ...schedulesForSpecificDate,
    ...schedulesForWeekDay,
  ].sort((first, second) => {
    if (first.date  !== second.date) {
      return second.date - first.date;
    }

    return first.startTime.localeCompare(second.startTime);
  });
}