import { HpEntry } from '../middleware/type';
import { sendMessage } from '../middleware/webSocet';
import { DeviceModel, HpEntryModel } from '../models/model';
import { getTemperature } from './meteo.service';
import { formatInTimeZone } from 'date-fns-tz';
import { TIME_ZONE } from './calendar.service';

// const parseDate = (str: String | undefined ):string   => !str ? "" : str.replace(/\./g, "-").replace(" ", "T");
const lastDataByRoot = new Map<string, HpEntry>();
const availableDatesByRoot = new Map<string, Set<string>>();
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
  availableDatesByRoot.delete(rootId);
  deviceInfoByRoot.delete(rootId);
}

export const getHpAvailableDates = async (rootId: string): Promise<string[]> => {
  const cachedDates = availableDatesByRoot.get(rootId);
  if (cachedDates) {
    return Array.from(cachedDates).sort().reverse();
  }

  const result = await HpEntryModel.aggregate<{ date: string }>([
    {
      $match: {
        rootId,
        createdAt: { $exists: true },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: {
            format: '%Y.%m.%d',
            date: '$createdAt',
            timezone: TIME_ZONE,
          },
        },
      },
    },
    { $project: { _id: 0, date: '$_id' } },
  ]);

  const dates = new Set(result.map(({ date }) => date));
  availableDatesByRoot.set(rootId, dates);

  return Array.from(dates).sort().reverse();
};

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



// CHPC podaje kod ostatniego błędu (ERR) i numer kolejny zdarzenia (ERRn).
// Nowy błąd to zmiana ERRn przy niezerowym ERR; zwraca jego kod albo undefined.
export const detectErrorEvent = (previous: HpEntry | undefined, current: HpEntry) => {
  const code = current.HP?.ERR;
  const sequence = current.HP?.ERRn;
  if (!code || sequence === undefined || sequence === null) return undefined;
  if (previous?.HP?.ERRn === sequence) return undefined;
  return code;
};

// Ostatni błąd z ostatnich 24 godzin (okno ruchome); starszy nie jest już pokazywany.
// Wyjątek: zablokowany sterownik (HP.ERRc >= 5) pokazuje ostatni błąd bez limitu czasu, aż do odblokowania.
export const LAST_ERROR_WINDOW_MS = 24 * 60 * 60 * 1000;
export const ERROR_LOCK_LIMIT = 5;

export const getHpLastError = async (rootId: string, now = new Date()) => {
  const current = await getHpLastData(rootId) as HpEntry;
  const locked = Number(current?.HP?.ERRc ?? 0) >= ERROR_LOCK_LIMIT;
  const since = new Date(now.getTime() - LAST_ERROR_WINDOW_MS);
  const doc = await HpEntryModel
    .findOne({ rootId, error_code: { $gt: 0 }, ...(locked ? {} : { createdAt: { $gte: since } }) })
    .sort({ createdAt: -1 })
    .select('time createdAt error_code HP.ERRc')
    .lean<HpEntry & { createdAt?: Date }>();
  return doc ?? {};
};

export const addHpData = async (rootId: string, data :HpEntry) => {
  data.t_out = getTemperature()!;
  const device = await getDeviceInfo(rootId);

  const previous = await getHpLastData(rootId) as HpEntry;
  const errorCode = detectErrorEvent(previous, data);

  const dataWithRoot = {
    ...data,
    rootId,
    deviceType: device.deviceType,
    deviceId: device.deviceId,
    ...(errorCode ? { error_code: errorCode } : {}),
  };
  lastDataByRoot.set(rootId, dataWithRoot);
  
  const doc = await HpEntryModel.create(dataWithRoot);

  const cachedDates = availableDatesByRoot.get(rootId);
  if (cachedDates) {
    const createdAt = (doc as unknown as { createdAt?: Date }).createdAt ?? new Date();
    const date = formatInTimeZone(createdAt, TIME_ZONE, 'yyyy.MM.dd');
    cachedDates.add(date);
  }

  sendMessage('update', rootId);
  return doc;
}
