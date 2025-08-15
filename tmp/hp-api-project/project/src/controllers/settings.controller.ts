import { Request, Response } from "express";
import { SettingsEntryModel } from "../models/settings.model";

export const getSettings = async (_: Request, res: Response) => {
  const doc = await SettingsEntryModel.findOne().sort({ createdAt: -1 });
  if (!doc) return res.status(404).json({ message: "No settings" });
  res.json(doc);
};

export const upsertSettings = async (req: Request, res: Response) => {
  const doc = await SettingsEntryModel.findOneAndUpdate({}, req.body, { upsert: true, new: true });
  res.json(doc);
};
