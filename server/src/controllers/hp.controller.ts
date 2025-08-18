import { Request, Response } from 'express'
import { fromZonedTime } from "date-fns-tz";
import { addDays } from "date-fns";
import { addHpData, getHpLastData, getHpAllData, clearData, getHpDataForDay } from '../services/hp.service'
import { HpEntry, OperationEntry } from '../middleware/type'
import { clearOperation, getOperationData } from '../services/operation.service'
import { HpEntryModel } from '../models/model'

interface THpClear {
  clear?: Boolean
}

function warsawDayBoundsUTC(dateStr: string) {
  const norm = dateStr.replace(/\./g, "-");         // 2025.08.19 -> 2025-08-19
  const startLocal = new Date(`${norm}T00:00:00`);
  const endLocal = addDays(startLocal, 1);

  const startUTC = fromZonedTime(startLocal, "Europe/Warsaw");
  const endUTC   = fromZonedTime(endLocal,   "Europe/Warsaw");
  return { startUTC, endUTC }; // używaj zakresu [startUTC, endUTC)
}



export const clearHp = async (req: Request<{}, {}, {}>, res: Response) => {
  try {
    console.log("Clear HP data");
    const data: THpClear | null = req.body;
    if (data?.clear == true) {
      await clearData();
      return res.status(200).send({ message: 'OK' });
    } else {
      return res.status(500).send({ message: 'Bad params' });
    }
  } catch (error) {
    console.log()
    return res.status(500).send({ message: error })
  }
}


export async function getHp(req: Request, res: Response) {
  try {
    console.log("Get HP last data");
    const result = await getHpLastData()
    return res.status(200).send(result)
  } catch (error) {
    console.log(error)
    return res.status(500).send({ message: error })
  }
}

export async function getHpAll(req: Request, res: Response) {
  try {
    const result = await getHpAllData()
    console.log("Get HP all data");
    return res.status(200).send(result)
  } catch (error) {
    console.log(error)
    return res.status(500).send({ message: error })
  }
}

export async function getHp4Day(req: Request, res: Response) {
  try {
    const { date } = req.query;
    if (!date || typeof date !== "string") {
      return res.status(400).json({ error: "Musisz podać date w formacie YYYY-MM-DD lub YYYY.MM.DD" });
    }

    const { startUTC: start, endUTC: end } = warsawDayBoundsUTC(date);

    const docs = await HpEntryModel
      .find({ createdAt: { $gte: start, $lt: end } }) // [start, end)
      .sort({ createdAt: -1 })
      .lean<HpEntry>();

    return res.status(200).json(docs);
  } catch (error) {
    console.error(error);
    return res.status(500).send({ message: String(error) });
  }
}

export const addHp = async (req: Request<{}, {}, HpEntry>, res: Response) => {
  const data :HpEntry = req.body;
  console.log("Add HP data");

  const operation: OperationEntry = Object.assign(getOperationData()); 
  console.log("Get HP operation");
  console.log(operation);
  try {   
    if (data && data.HP && data.HP.Ttarget) {
      await addHpData(data);
    }    
    console.log("Clear HP operation");
    clearOperation();    
    
    return res.status(201).json({ operation: operation});
  } catch (error) {
    return res.status(500).send({ error: error })
  }
}

