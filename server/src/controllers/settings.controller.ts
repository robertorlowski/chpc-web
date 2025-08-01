import { Request, Response } from 'express'

import { getSettingsData, setSettingsData } from '../services/settings.service'
import { TSettings } from '../middleware/type'

export async function getSettings(req: Request, res: Response) {
  try {
    console.log("Get settings");
    const result = await getSettingsData()
    return res.status(200).send(result)
  } catch (error) {
    return res.status(500).send({ error: error })
  }
}

export const setSettings = async (req: Request<{}, {}, TSettings>, res: Response) => {
  const data :TSettings = req.body;
  try {
    console.log("Set settings");
    await setSettingsData(data);
    return res.status(201);
  } catch (error) {
    return res.status(500).send({ error: error })
  }
}
