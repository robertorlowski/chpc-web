import { Request, Response } from 'express';
import { fromZonedTime } from 'date-fns-tz';
import {
  addWaterMeterReading, addWaterPressureReport, deleteWaterMeterReading, getWaterMeterSummary,
  getWaterPressureRuns, getWaterPressureSummary, isCompressorSeconds, listWaterMeterReadings,
  RUN_IN_PROGRESS_MS, setCompressorSeconds, SummaryPeriod, validateRunReport,
} from '../services/water-pressure.service';
import { TIME_ZONE, warsawDayBoundsUTC } from '../../../core/time';

const pad = (value: number) => String(value).padStart(2, '0');
const warsawMidnight = (year: number, month: number, day: number) =>
  fromZonedTime(`${year}-${pad(month)}-${pad(day)}T00:00:00`, TIME_ZONE);

// Wiadomość sterownika co 1 s. Odpowiedź nie niesie ustawień: te sterownik
// dostaje raz na start z POST /devices/register.
export async function addWaterPressure(req: Request, res: Response) {
  const report = validateRunReport(req.body);
  if (!report) return res.status(400).json({ message: 'Nieprawidłowe dane uruchomienia.' });

  try {
    await addWaterPressureReport(req.deviceRootId as string, report);
    return res.status(201).json({});
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: String(error) });
  }
}

// Czas kompresora zmieniony na stronie sterownika {compressor_seconds}.
export async function updateWaterPressureSettings(
  req: Request<{}, {}, { compressor_seconds?: unknown }>,
  res: Response,
) {
  const seconds = req.body?.compressor_seconds;
  if (!isCompressorSeconds(seconds)) {
    return res.status(400).json({ message: 'compressor_seconds: pełne sekundy 1–3600.' });
  }
  try {
    const saved = await setCompressorSeconds(req.deviceRootId as string, seconds);
    if (saved === null) return res.status(404).json({ message: 'Urządzenie nie jest hydroforem.' });
    return res.status(200).json({ compressor_seconds: saved });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: String(error) });
  }
}

const withProgress =<T extends { lastSeenAt?: Date }>(run: T, now: number) => ({
  ...run,
  inProgress: run.lastSeenAt ? now - new Date(run.lastSeenAt).getTime() < RUN_IN_PROGRESS_MS : false,
});

// ?from=YYYY-MM-DD&to=YYYY-MM-DD (dni czasu warszawskiego, to włącznie)
// albo ?fromTime=ISO&toTime=ISO (okres między odczytami wodomierza).
export async function getWaterPressureRunList(req: Request, res: Response) {
  const { from, to, fromTime, toTime } = req.query;
  let start: Date;
  let end: Date;
  if (typeof fromTime === 'string' && typeof toTime === 'string') {
    start = new Date(fromTime);
    end = new Date(toTime);
  } else if (typeof from === 'string' && typeof to === 'string') {
    start = warsawDayBoundsUTC(from).startUTC;
    end = warsawDayBoundsUTC(to).endUTC;
  } else {
    return res.status(400).json({ message: 'Podaj from i to albo fromTime i toTime.' });
  }
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return res.status(400).json({ message: 'Nieprawidłowy zakres dat.' });
  }

  try {
    const now = Date.now();
    const runs = await getWaterPressureRuns(req.deviceRootId as string, start, end);
    return res.status(200).json(runs.map((run) => withProgress(run, now)));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: String(error) });
  }
}

// ?period=day|month|year&date=YYYY-MM-DD
export async function getWaterPressureSummaryEntry(req: Request, res: Response) {
  const { period, date } = req.query;
  const match = typeof date === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(date) : null;
  if (!match || (period !== 'day' && period !== 'month' && period !== 'year')) {
    return res.status(400).json({ message: 'Podaj period=day|month|year i date=YYYY-MM-DD.' });
  }
  const [year, month] = [Number(match[1]), Number(match[2])];

  let from: Date;
  let to: Date;
  let buckets: number;
  if (period === 'day') {
    ({ startUTC: from, endUTC: to } = warsawDayBoundsUTC(date as string));
    buckets = 24;
  } else if (period === 'month') {
    from = warsawMidnight(year, month, 1);
    to = month === 12 ? warsawMidnight(year + 1, 1, 1) : warsawMidnight(year, month + 1, 1);
    buckets = new Date(Date.UTC(year, month, 0)).getUTCDate();
  } else {
    from = warsawMidnight(year, 1, 1);
    to = warsawMidnight(year + 1, 1, 1);
    buckets = 12;
  }

  try {
    const result = await getWaterPressureSummary(req.deviceRootId as string, period as SummaryPeriod, from, to, buckets);
    return res.status(200).json({ period, date, buckets: result });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: String(error) });
  }
}

export async function getWaterMeter(req: Request, res: Response) {
  try {
    return res.status(200).json(await listWaterMeterReadings(req.deviceRootId as string));
  } catch (error) {
    return res.status(500).json({ message: String(error) });
  }
}

export async function addWaterMeter(req: Request<{}, {}, { readAt?: string; valueM3?: number; note?: string }>, res: Response) {
  const readAt = new Date(req.body?.readAt ?? '');
  const valueM3 = req.body?.valueM3;
  if (Number.isNaN(readAt.getTime()) || typeof valueM3 !== 'number' || !Number.isFinite(valueM3) || valueM3 < 0) {
    return res.status(400).json({ message: 'Podaj readAt (data) i valueM3 (stan wodomierza w m³).' });
  }
  try {
    const reading = await addWaterMeterReading(req.deviceRootId as string, {
      readAt, valueM3, note: typeof req.body.note === 'string' ? req.body.note : '',
    });
    return res.status(201).json(reading);
  } catch (error) {
    return res.status(400).json({ message: String(error) });
  }
}

export async function deleteWaterMeter(req: Request<{ id: string }>, res: Response) {
  try {
    const deleted = await deleteWaterMeterReading(req.deviceRootId as string, req.params.id);
    return deleted ? res.status(200).json({}) : res.status(404).json({ message: 'Nie znaleziono odczytu.' });
  } catch {
    return res.status(400).json({ message: 'Nieprawidłowy identyfikator odczytu.' });
  }
}

// ?year=YYYY
export async function getWaterMeterSummaryEntry(req: Request, res: Response) {
  const year = Number(req.query.year);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return res.status(400).json({ message: 'Podaj year=YYYY.' });
  }
  const monthStarts = Array.from({ length: 13 }, (_, index) =>
    index < 12 ? warsawMidnight(year, index + 1, 1) : warsawMidnight(year + 1, 1, 1));
  try {
    return res.status(200).json(await getWaterMeterSummary(req.deviceRootId as string, year, monthStarts));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: String(error) });
  }
}
