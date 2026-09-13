
import { SettingsEntry } from '../middleware/type';
import { SettingsEntryModel } from '../models/model';

export const getSettingsData = async (rootId: string) => {
  const doc = await SettingsEntryModel.findOne({ rootId }).sort({ createdAt: -1 });
  return doc;
}

export const setSettingsData = async (rootId: string, data :SettingsEntry) => {
  let doc: SettingsEntry | null | undefined = await SettingsEntryModel.findOneAndUpdate(
      { rootId },
      { ...data, rootId }, 
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


