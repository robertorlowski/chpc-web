// Endpointy fotowoltaiki (/photovoltaic/...): bieżący stan z panelami, przebieg dnia, produkcja
// w dniach / miesiącach / latach, odczyty dnia (całość albo panel) i mikrofalowniki. Tylko odczyt.
import { Request, Response } from 'express';
import { formatInTimeZone } from 'date-fns-tz';
import {
  getCurrentView, getDayView, getInverters, getReadings, getSummaryView,
} from '../services/photovoltaic.service';
import { TIME_ZONE } from '../../../core/time';

const today = () => formatInTimeZone(new Date(), TIME_ZONE, 'yyyy-MM-dd');
const DAY = /^\d{4}-\d{2}-\d{2}$/;

async function respond(res: Response, work: () => Promise<unknown>) {
  try {
    return res.status(200).json(await work());
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: String(error) });
  }
}

export const getPvCurrent = (req: Request, res: Response) =>
  respond(res, () => getCurrentView(req.deviceRootId as string));

// ?date=YYYY-MM-DD (domyślnie dziś w Warszawie)
export function getPvDay(req: Request, res: Response) {
  const date = (req.query.date as string | undefined) ?? today();
  if (!DAY.test(date)) return res.status(400).json({ message: 'date: YYYY-MM-DD.' });
  return respond(res, () => getDayView(req.deviceRootId as string, date));
}

// ?period=month&date=YYYY-MM | period=year&date=YYYY | period=total
export function getPvSummary(req: Request, res: Response) {
  const period = req.query.period as string;
  const date = (req.query.date as string | undefined) ?? '';
  const valid = (period === 'month' && /^\d{4}-\d{2}$/.test(date))
    || (period === 'year' && /^\d{4}$/.test(date))
    || period === 'total';
  if (!valid) return res.status(400).json({ message: 'period=month&date=YYYY-MM | year&date=YYYY | total.' });
  return respond(res, () => getSummaryView(req.deviceRootId as string, period as 'month' | 'year' | 'total', date));
}

// ?date=YYYY-MM-DD[&panel=serial-port]
export function getPvReadings(req: Request, res: Response) {
  const date = (req.query.date as string | undefined) ?? today();
  const panel = req.query.panel as string | undefined;
  if (!DAY.test(date) || (panel !== undefined && !/^\d+-\d+$/.test(panel))) {
    return res.status(400).json({ message: 'date: YYYY-MM-DD, panel: serial-port.' });
  }
  return respond(res, () => getReadings(req.deviceRootId as string, date, panel));
}

export const getPvInverters = (req: Request, res: Response) =>
  respond(res, () => getInverters(req.deviceRootId as string));
