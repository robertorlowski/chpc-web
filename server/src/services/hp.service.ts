import { getTemperature } from '../middleware/openmeteo';
import { HpEntry } from '../middleware/type';
import { sendMessage } from '../middleware/webSocet';
import { DeviceModel, HpEntryModel } from '../models/model';

// const parseDate = (str: String | undefined ):string   => !str ? "" : str.replace(/\./g, "-").replace(" ", "T");
const lastDataByRoot = new Map<string, HpEntry>();
const deviceInfoByRoot = new Map<string, {
  deviceType: HpEntry['deviceType'];
  deviceId: string;
}>();

const getDeviceInfo = async (rootId: string) => {
  const cached = deviceInfoByRoot.get(rootId);
  if (cached) return cached;

  const device = await DeviceModel
    .findById(rootId)
    .select('deviceType deviceId')
    .lean();

  if (!device) {
    throw new Error(`Device not found: ${rootId}`);
  }

  const info = {
    deviceType: device.deviceType,
    deviceId: device.deviceId,
  };
  deviceInfoByRoot.set(rootId, info);
  return info;
};

export const assignLegacyHpData = async (rootId: string) => {
  const device = await getDeviceInfo(rootId);

  await HpEntryModel.updateMany(
    { $or: [{ rootId: { $exists: false } }, { rootId }] },
    {
      $set: {
        rootId,
        deviceType: device.deviceType,
        deviceId: device.deviceId,
      },
    },
  );
};

export const clearData = async (rootId: string) => {
  await HpEntryModel.deleteMany({ rootId });
  lastDataByRoot.delete(rootId);
  deviceInfoByRoot.delete(rootId);
}

export const getHpLastData = async (rootId: string) => {

  const cached = lastDataByRoot.get(rootId);
  if (cached) return cached;

  const lastData = await HpEntryModel.findOne({ rootId }).sort({ createdAt: -1 }).lean<HpEntry>();
  if (lastData) {
    lastDataByRoot.set(rootId, lastData);
  }
  
  if (!lastData) {
    return {};
  }
  return lastData;
}

export const getHpAllData = async (rootId: string) => {
  const currentYear = new Date().getFullYear();
  const startOfCurrentYear = new Date(currentYear, 0, 1);

  const doc = await HpEntryModel
    .find({ rootId, createdAt: { $gte: startOfCurrentYear } })
    .sort({ createdAt: -1 })
    .lean<HpEntry>();
  return doc;
}

export const getHpDataForDay = async (rootId: string, day: Date) => {
  // ustawiamy początek dnia (00:00:00.000)
  const startOfDay = new Date(day);
  startOfDay.setHours(0, 0, 0, 0);

  // ustawiamy koniec dnia (23:59:59.999)
  const endOfDay = new Date(day);
  endOfDay.setHours(23, 59, 59, 999);

  const doc = await HpEntryModel
    .find({ rootId,
      createdAt: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
    })
    .sort({ createdAt: -1 })
    .lean<HpEntry>();

  return doc;
};



export const addHpData = async (rootId: string, data :HpEntry) => {
  data.t_out = getTemperature()!;
  const device = await getDeviceInfo(rootId);

  const dataWithRoot = {
    ...data,
    rootId,
    deviceType: device.deviceType,
    deviceId: device.deviceId,
  };
  lastDataByRoot.set(rootId, dataWithRoot);
  
  const doc = await HpEntryModel.create(dataWithRoot);
  sendMessage('update');
  return doc;
}
