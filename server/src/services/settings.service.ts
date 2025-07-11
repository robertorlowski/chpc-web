
import db from '../middleware/db';
import { TSettings } from '../middleware/type';

export const getSettingsData = async () => {
  await db.read();
  const settings: TSettings = db.data.settings;
  return settings;
}

export const setSettingsData = async (data :TSettings) => {
  await db.read();
  db.data.settings = data;
  await db.write();
  return data;
}


