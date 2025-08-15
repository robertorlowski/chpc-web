
import db from '../middleware/db';
import { SettingsEntry } from '../middleware/type';

export const getSettingsData = async () => {
  await db.read();
  const settings: SettingsEntry = db.data.settings;
  return settings;
}

export const setSettingsData = async (data :SettingsEntry) => {
  await db.read();
  db.data.settings = data;
  await db.write();
  return data;
}


