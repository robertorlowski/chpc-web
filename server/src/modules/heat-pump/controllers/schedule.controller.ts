// Harmonogramy pompy (/schedules...): CRUD na polu schedules urządzenia (zakładka
// Harmonogramy) i harmonogram działający teraz. Zmiany działają od najbliższego
// przebiegu schedulera (do 60 s).
import { Request, Response } from 'express';
import { ScheduleEntry } from '../types';
import { deleteSchedule, getSchedules, saveSchedule, updateSchedule } from '../services/schedule.service';
import { getCurrentSchedule } from '../services/scheduler.service';

export async function getScheduleEntries(req: Request, res: Response) {
  try {
    const rootId = req.deviceRootId as string;
    return res.status(200).json(await getSchedules(rootId));
  } catch (error) {
    return res.status(500).json({ message: String(error) });
  }
}

// GET /schedules/current: {scheduleId, work_mode}; scheduleId null = ustawienie domyślne.
export async function getCurrentScheduleEntry(req: Request, res: Response) {
  try {
    const rootId = req.deviceRootId as string;
    return res.status(200).json(await getCurrentSchedule(rootId));
  } catch (error) {
    return res.status(500).json({ message: String(error) });
  }
}

export async function createScheduleEntry(
  req: Request<{}, {}, ScheduleEntry>,
  res: Response,
) {
  try {
    const rootId = req.deviceRootId as string;
    const schedule = await saveSchedule(rootId, req.body);
    return res.status(201).json(schedule);
  } catch (error) {
    return res.status(400).json({ message: String(error) });
  }
}

export async function updateScheduleEntry(
  req: Request<{ id: string }, {}, ScheduleEntry>,
  res: Response,
) {
  try {
    const rootId = req.deviceRootId as string;
    const schedule = await updateSchedule(rootId, req.params.id, req.body);
    return res.status(200).json(schedule);
  } catch (error) {
    return res.status(400).json({ message: String(error) });
  }
}

export async function deleteScheduleEntry(req: Request<{ id: string }>, res: Response) {
  try {
    const rootId = req.deviceRootId as string;
    await deleteSchedule(rootId, req.params.id);
    return res.status(204).send();
  } catch (error) {
    return res.status(400).json({ message: String(error) });
  }
}
