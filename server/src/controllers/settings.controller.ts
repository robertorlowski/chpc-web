import { Request, Response } from 'express'

import { getSettingsData, setSettingsData } from '../services/settings.service'
import { SettingsEntry } from '../middleware/type'
import { SettingsEntryModel } from '../models/model';

export async function getSettings(req: Request, res: Response) {
  try {
    console.log("Get settings");
    const doc = await getSettingsData();
    return res.status(200).send(doc)
  } catch (error) {
    return res.status(500).send({ message: error })
  }
}

export const setSettings = async (req: Request<{}, {}, SettingsEntry>, res: Response) => {
  const data :SettingsEntry = req.body;
  try {
    console.log("Set settings");
    await setSettingsData(data);
    return res.status(201).send({ message: "OK" });
  } catch (error) {
    return res.status(500).send({ message: error })
  }
}
