import { Request, Response } from "express";
import { OperationEntryModel } from "../models/operation.model";

export const getOperation = async (_: Request, res: Response) => {
  const doc = await OperationEntryModel.findOne().sort({ createdAt: -1 });
  if (!doc) return res.status(404).json({ message: "No operation settings" });
  res.json(doc);
};

export const upsertOperation = async (req: Request, res: Response) => {
  const doc = await OperationEntryModel.findOneAndUpdate({}, req.body, { upsert: true, new: true });
  res.json(doc);
};
