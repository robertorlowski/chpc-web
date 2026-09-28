
// Starsze ustawienia czasowe (kolekcja settings): najnowszy dokument urządzenia,
// zapis przez upsert. Scheduler z nich nie korzysta.
import { SettingsEntry } from '../types';
import { SettingsEntryModel } from '../models/settings.model';

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


