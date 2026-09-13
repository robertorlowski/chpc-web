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
      await clearData(req.deviceRootId as string);
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
    console.log("Get HP last data: " + req.deviceRootId as string);
    const result = await getHpLastData(req.deviceRootId as string)
    return res.status(200).send(result)
  } catch (error) {
    console.log(error)
    return res.status(500).send({ message: error })
  }
}

export async function getHpAll(req: Request, res: Response) {
  try {
    const result = await getHpAllData(req.deviceRootId as string)
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
      .find({ rootId: req.deviceRootId as string, createdAt: { $gte: start, $lt: end } }) // [start, end)
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
    const groupByDay = group === "day";
    const bucket = groupByDay
      ? { $dayOfMonth: { date: "$createdAt", timezone: "Europe/Warsaw" } }
      : { $month: { date: "$createdAt", timezone: "Europe/Warsaw" } };

    const result = await HpEntryModel.aggregate([
      { $match: { rootId: req.deviceRootId as string, createdAt: { $gte: start, $lt: end } } },
      { $sort: { createdAt: 1 } },
      {
        $setWindowFields: {
          sortBy: { createdAt: 1 },
          output: {
            previousCreatedAt: { $shift: { output: "$createdAt", by: -1 } },
            previousWatts: { $shift: { output: "$HP.Watts", by: -1 } },
            previousPv: { $shift: { output: "$PV.total_power", by: -1 } },
          },
        },
      },
      {
        $set: {
          intervalHours: { $divide: [{ $subtract: ["$createdAt", "$previousCreatedAt"] }, 3600000] },
          bucket,
          localHour: { $hour: { date: "$createdAt", timezone: "Europe/Warsaw" } },
          localDayOfWeek: { $dayOfWeek: { date: "$createdAt", timezone: "Europe/Warsaw" } },
        },
      },
      { $match: { intervalHours: { $gt: 0, $lte: 0.25 }, previousWatts: { $gte: 0 } } },
      {
        $set: {
          consumptionWh: { $multiply: [{ $avg: ["$previousWatts", { $ifNull: ["$HP.Watts", 0] }] }, "$intervalHours"] },
          pvWh: { $multiply: [{ $avg: ["$previousPv", { $ifNull: ["$PV.total_power", 0] }] }, "$intervalHours"] },
          gridWh: {
            $multiply: [
              { $max: [0, { $avg: [
                { $subtract: ["$previousWatts", { $ifNull: ["$previousPv", 0] }] },
                { $subtract: [{ $ifNull: ["$HP.Watts", 0] }, { $ifNull: ["$PV.total_power", 0] }] },
              ] }] },
              "$intervalHours",
            ],
          },
        },
      },
      {
        $set: {
          peakGridWh: {
            $cond: [
              { $and: [
                { $gte: ["$localDayOfWeek", 2] }, { $lte: ["$localDayOfWeek", 6] },
                { $or: [
                  { $and: [{ $gte: ["$localHour", 6] }, { $lt: ["$localHour", 13] }] },
                  { $and: [{ $gte: ["$localHour", 15] }, { $lt: ["$localHour", 22] }] },
                ] },
              ] },
              "$gridWh",
              0,
            ],
          },
        },
      },
      {
        $group: {
          _id: "$bucket",
          consumptionKWh: { $sum: { $divide: ["$consumptionWh", 1000] } },
          pvGenerationKWh: { $sum: { $divide: ["$pvWh", 1000] } },
          gridEnergyKWh: { $sum: { $divide: ["$gridWh", 1000] } },
          peakGridEnergyKWh: { $sum: { $divide: ["$peakGridWh", 1000] } },
          offPeakGridEnergyKWh: { $sum: { $divide: [{ $subtract: ["$gridWh", "$peakGridWh"] }, 1000] } },
        },
      },
      {
        $project: {
          _id: 0,
          ...(groupByDay ? { day: "$_id" } : { month: "$_id" }),
          consumptionKWh: 1,
          pvGenerationKWh: 1,
          gridEnergyKWh: 1,
          pvUsedKWh: {
            $max: [
              0,
              { $subtract: ["$consumptionKWh", "$gridEnergyKWh"] },
            ],
          },
          totalVariableCostPLN: {
            $max: [
              { $add: [
                { $multiply: ["$peakGridEnergyKWh", 1.2302] },
                { $multiply: ["$offPeakGridEnergyKWh", 0.6305] },
              ] },
              { $multiply: ["$gridEnergyKWh", 0.6305] },
            ],
          },
        },
      },
      { $sort: groupByDay ? { day: 1 } : { month: 1 } },
    ]);

    return res.status(200).json(result);
  } catch (error) {
    console.error(error);
    return res.status(500).send({ message: String(error) });
  }
}

export const addHp = async (req: Request<{}, {}, HpEntry>, res: Response) => {
  const data :HpEntry = req.body;
  console.log("Add HP data");

  const operation: OperationEntry = Object.assign(getOperationData(req.deviceRootId as string)); 
  console.log("Get HP operation");
  console.log(operation);
  try {   
    if (data && data.HP && data.HP.Ttarget) {
      await addHpData(req.deviceRootId as string, data);
    }    
    console.log("Clear HP operation");
    clearOperation(req.deviceRootId as string);    
    
    return res.status(201).json({ operation: operation});
  } catch (error) {
    return res.status(500).send({ error: error })
  }
}

