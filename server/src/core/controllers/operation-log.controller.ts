// GET /api/operations?rootId=…&date=YYYY-MM-DD — dziennik operacji sterownika z dnia (zakładka „Operacje”):
// {date, today, planned: [...w toku, ...zaplanowane], done: [...]}; bez date — dziś (Warszawa).
import { Request, Response } from 'express';
import { formatInTimeZone } from 'date-fns-tz';
import { TIME_ZONE } from '../time';
import { getOperationsDay } from '../services/operation-log.service';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function getOperations(req: Request, res: Response) {
  const date = typeof req.query.date === 'string' && req.query.date ? req.query.date : formatInTimeZone(new Date(), TIME_ZONE, 'yyyy-MM-dd');
  if (!DATE.test(date)) return res.status(400).json({ message: 'date: RRRR-MM-DD.' });
  try {
    return res.status(200).json(await getOperationsDay(req.deviceRootId as string, date));
  } catch (error) {
    return res.status(500).json({ message: String(error) });
  }
}
