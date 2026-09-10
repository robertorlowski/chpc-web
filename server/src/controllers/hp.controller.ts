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

function warsawDateRangeBoundsUTC(startDate: string, endDate: string) {
  const { startUTC } = warsawDayBoundsUTC(startDate);
  const { endUTC } = warsawDayBoundsUTC(endDate);
  return { startUTC, endUTC };
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
    const { date, startDate, endDate } = req.query;
    const isDate = typeof date === "string";
    const isRange = typeof startDate === "string" && typeof endDate === "string";

    if (!isDate && !isRange) {
      return res.status(400).json({ error: "Musisz podać date albo startDate i endDate" });
    }

    const { startUTC: start, endUTC: end } = isRange
      ? warsawDateRangeBoundsUTC(startDate, endDate)
      : warsawDayBoundsUTC(date as string);

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

export async function getHpMonthlySummary(req: Request, res: Response) {
  try {
    const { startDate, endDate, group } = req.query;
    if (typeof startDate !== "string" || typeof endDate !== "string") {
      return res.status(400).json({ error: "Musisz podać startDate i endDate" });
    }

    const { startUTC: start } = warsawDayBoundsUTC(startDate);
    const { endUTC: end } = warsawDayBoundsUTC(endDate);
    const groupByWeek = group === "week";
    const docs = await HpEntryModel.find({
      createdAt: { $gte: start, $lt: end },
    }).sort({ createdAt: 1 }).lean() as unknown as Array<HpEntry & { createdAt: Date }>;

    const startCalendar = new Date(`${startDate.replace(/\./g, "-")}T00:00:00Z`);
    const totals = new Map<number, {
      consumptionKWh: number;
      pvGenerationKWh: number;
      gridEnergyKWh: number;
      peakGridEnergyKWh: number;
      offPeakGridEnergyKWh: number;
    }>();

    const getLocalParts = (date: Date) => {
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Warsaw",
        weekday: "short",
        hour: "2-digit",
        hourCycle: "h23",
        month: "2-digit",
      }).formatToParts(date);
      return Object.fromEntries(parts.map((part) => [part.type, part.value]));
    };

    docs.slice(1).forEach((current, index) => {
      const previous = docs[index];
      const currentDate = current.createdAt as Date;
      const previousDate = previous.createdAt as Date;
      const intervalHours = (currentDate.getTime() - previousDate.getTime()) / 3600000;

      if (intervalHours <= 0 || intervalHours > 0.25) return;

      const previousWatts = Math.max(0, Number(previous.HP?.Watts || 0));
      const currentWatts = Math.max(0, Number(current.HP?.Watts || 0));
      const previousPv = Math.max(0, Number(previous.PV?.total_power || 0));
      const currentPv = Math.max(0, Number(current.PV?.total_power || 0));
      const consumptionWh = ((previousWatts + currentWatts) / 2) * intervalHours;
      const pvWh = ((previousPv + currentPv) / 2) * intervalHours;
      const gridWh = Math.max(0, ((previousWatts - previousPv) + (currentWatts - currentPv)) / 2) * intervalHours;
      const local = getLocalParts(new Date((previousDate.getTime() + currentDate.getTime()) / 2));
      const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(local.weekday);
      const hour = Number(local.hour);
      const isPeak = weekday >= 1 && weekday <= 5 &&
        ((hour >= 6 && hour < 13) || (hour >= 15 && hour < 22));
      const dayOffset = Math.floor((currentDate.getTime() - startCalendar.getTime()) / 86400000);
      const bucket = groupByWeek ? Math.floor(dayOffset / 7) : Number(local.month);
      const total = totals.get(bucket) || {
        consumptionKWh: 0,
        pvGenerationKWh: 0,
        gridEnergyKWh: 0,
        peakGridEnergyKWh: 0,
        offPeakGridEnergyKWh: 0,
      };

      total.consumptionKWh += consumptionWh / 1000;
      total.pvGenerationKWh += pvWh / 1000;
      total.gridEnergyKWh += gridWh / 1000;
      if (isPeak) total.peakGridEnergyKWh += gridWh / 1000;
      else total.offPeakGridEnergyKWh += gridWh / 1000;
      totals.set(bucket, total);
    });

    const result = Array.from(totals.entries()).map(([bucket, total]) => ({
      ...(groupByWeek ? { week: bucket } : { month: bucket }),
      ...total,
      totalVariableCostPLN: total.peakGridEnergyKWh * 1.2302 +
        total.offPeakGridEnergyKWh * 0.6305,
    }));

    return res.status(200).json(result);
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

