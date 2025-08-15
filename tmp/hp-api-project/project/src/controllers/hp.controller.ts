import { Request, Response } from "express";
import { HpEntryModel } from "../models/hp.model";

export const listHp = async (_: Request, res: Response) => {
  const docs = await HpEntryModel.find().sort({ createdAt: -1 }).limit(500);
  res.json(docs);
};

export const createHp = async (req: Request, res: Response) => {
  const doc = await HpEntryModel.create(req.body);
  res.status(201).json(doc);
};

export const latestHp = async (_: Request, res: Response) => {
  const doc = await HpEntryModel.findOne().sort({ createdAt: -1 });
  if (!doc) return res.status(404).json({ message: "No data" });
  res.json(doc);
};
