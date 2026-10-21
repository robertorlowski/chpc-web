
// CRUD harmonogramów pompy osadzonych w urządzeniu (devices.schedules), dla
// schedule.controller. O tym, który harmonogram działa, decyduje scheduler.service.ts.
import { ScheduleEntry } from '../types';
import { DeviceDocument, DeviceModel } from '../../../core/models/device.model';


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

// Pełna podmiana wpisu: pominięte pola (np. temperatury, date) są czyszczone,
// enabled bez wartości zostaje, forceStart bez wartości = false.
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

