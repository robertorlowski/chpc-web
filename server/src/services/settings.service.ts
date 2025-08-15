
import { SettingsEntry } from '../middleware/type';
import { SettingsEntryModel } from '../models/model';

export const getSettingsData = async () => {
  const doc = await SettingsEntryModel.findOne().sort({ createdAt: -1 });
  return doc;
}

export const setSettingsData = async (data :SettingsEntry) => {
  let doc: SettingsEntry | null | undefined = await SettingsEntryModel.findOneAndUpdate(
      {}, 
      data, 
      {
        new: true,                         // zwróć zaktualizowany
        upsert: true,                      // utwórz, jeśli nie istnieje
        sort: { createdAt: -1 },           // „ostatni” po dacie
      }
    )
    .lean<SettingsEntry>()
    .exec();
  return doc;
}


