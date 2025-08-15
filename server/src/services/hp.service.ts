import { HpEntry } from '../middleware/type';
import { sendMessage } from '../middleware/webSocet';
import { HpEntryModel } from '../models/model';

// const parseDate = (str: String | undefined ):string   => !str ? "" : str.replace(/\./g, "-").replace(" ", "T");
let lastData :HpEntry | null ;

export const clearData = async () => {
  await HpEntryModel.deleteMany({});
}

export const getHpLastData = async () => {
  if (!lastData) {
     lastData = await HpEntryModel.findOne({}).sort({ createdAt: -1 }).lean<HpEntry>();
  }
  
  if (!lastData) {
    return {};
  }
  return lastData;
}

export const getHpAllData = async () => {
  // data sprzed 7 dni
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const doc = await HpEntryModel
    .find({
      createdAt: { $gte: sevenDaysAgo }
    })
    .sort({ createdAt: -1 })
    .lean<HpEntry>();
  return doc;
}


export const addHpData = async (data :HpEntry) => {
  lastData = data;
  const doc = await HpEntryModel.create(data);
  sendMessage('update');
  return doc;
}
