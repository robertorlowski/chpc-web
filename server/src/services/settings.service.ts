
import { SettingsEntry } from '../middleware/type';
import { SettingsEntryModel } from '../models/model';

export const getSettingsData = async () => {
  const doc = await SettingsEntryModel.findOne().sort({ createdAt: -1 });
  return doc;
}

export const setSettingsData = async (data :SettingsEntry) => {
  let doc = await SettingsEntryModel.findOneAndUpdate({}, data, { createdAt: -1 });
  if (!doc) {
    doc = await SettingsEntryModel.create(data);
  }
  return data;
}


