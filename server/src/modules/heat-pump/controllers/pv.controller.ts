// Odczyty PV z DTU Hoymiles (/pv...): zapis od sterownika co (/pv/add, co 60 s)
// i odczyty dla klienta. Kolekcja pv (models/pv.model.ts), logika w services/pv.service.ts.
import { Request, Response } from 'express'
import { PvEntry } from '../types'
import { addPvData, getPvLastData, getPvRange } from '../services/pv.service'
import { warsawDateRangeBoundsUTC, warsawDayBoundsUTC } from '../../../core/time'

// Zapis odczytu DTU wysłanego przez sterownik co 60 s. Odpowiedź nie niesie
// operacji: tę sterownik dostaje wyłącznie z /hp/add.
export const addPv = async (req: Request<{}, {}, PvEntry>, res: Response) => {
  const data = req.body;
  if (!data || typeof data.total_power !== 'number'
    || (data.panels !== undefined && !Array.isArray(data.panels))) {
    return res.status(400).json({ message: 'Nieprawidłowe dane PV.' });
  }

  try {
    await addPvData(req.deviceRootId as string, data);
    return res.status(201).json({});
  } catch (error) {
    console.error(error);
    return res.status(500).send({ message: String(error) });
  }
}

// GET /pv: ostatni odczyt z panelami, bez limitu wieku ({} gdy brak).
export async function getPv(req: Request, res: Response) {
  try {
    const result = await getPvLastData(req.deviceRootId as string);
    return res.status(200).json(result ?? {});
  } catch (error) {
    console.error(error);
    return res.status(500).send({ message: String(error) });
  }
}

export async function getPvForRange(req: Request, res: Response) {
  try {
    const { date, startDate, endDate } = req.query;
    const isDate = typeof date === "string";
    const isRange = typeof startDate === "string" && typeof endDate === "string";

    if (!isDate && !isRange) {
      return res.status(400).json({ error: "Musisz podać date albo startDate i endDate" });
    }

    const { startUTC: start, endUTC: end } = isRange
      ? warsawDateRangeBoundsUTC(startDate, endDate)
      : warsawDayBoundsUTC(date as string);

    const docs = await getPvRange(req.deviceRootId as string, start, end);
    return res.status(200).json(docs);
  } catch (error) {
    console.error(error);
    return res.status(500).send({ message: String(error) });
  }
}
