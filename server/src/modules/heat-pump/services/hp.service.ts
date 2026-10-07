// Telemetria pompy: zapis (addHpData z POST /hp/add), wykrywanie zdarzeń błędów CHPC,
// ostatni błąd i odczyty kolekcji hp. Trzyma w pamięci ostatnią telemetrię i listę
// dni z danymi per rootId (do restartu serwera); scheduler też czyta stąd ostatnie dane.
import { comparisonKey, createPlateauWriter } from '../../../core/services/plateau-writer.service';
import { HpEntry } from '../types';
import { sendMessage } from '../../../core/websocket';
import { HpEntryModel } from '../models/hp.model';
import { getTemperature } from '../../../core/services/meteo.service';
import { formatInTimeZone } from 'date-fns-tz';
import { TIME_ZONE } from '../../../core/time';
import { forgetDeviceInfo, getDeviceInfo } from '../../../core/services/device-info.service';

// const parseDate = (str: String | undefined ):string   => !str ? "" : str.replace(/\./g, "-").replace(" ", "T");
// Ostatnia telemetria w postaci, w jakiej przyszła (z polami spoza schematu, bez
// createdAt); po restarcie odtwarzana z bazy przy pierwszym odczycie.
const lastDataByRoot = new Map<string, HpEntry>();
// Dni z danymi (YYYY.MM.DD, Warszawa); addHpData dopisuje dzień tylko do już wczytanego zbioru.
const availableDatesByRoot = new Map<string, Set<string>>();

// Migracja jednorazowa: przypisuje urządzeniu rekordy hp sprzed wprowadzenia rootId.
// Obecnie nigdzie niewywoływana.
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

// Usuwa telemetrię urządzenia (kolekcja pv zostaje) i czyści pamięć podręczną.
export const clearData = async (rootId: string) => {
  await HpEntryModel.deleteMany({ rootId });
  lastDataByRoot.delete(rootId);
  availableDatesByRoot.delete(rootId);
  forgetDeviceInfo(rootId);
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

// Ostatnia telemetria urządzenia albo {} gdy brak. Używana przez GET /hp, /operation,
// scheduler (temperatury domyślne), wykrywanie błędów i getHpLastError.
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

// GET /hp/all: rekordy od 1 stycznia bieżącego roku. Granica roku liczona w strefie
// serwera (na Render UTC), nie w czasie warszawskim.
export const getHpAllData = async (rootId: string) => {
  const currentYear = new Date().getFullYear();
  const startOfCurrentYear = new Date(currentYear, 0, 1);

  const doc = await HpEntryModel
    .find({ rootId, createdAt: { $gte: startOfCurrentYear } })
    .sort({ createdAt: -1 })
    .lean<HpEntry>();
  return doc;
}

// Nieużywane (hp.controller tylko importuje); doba w strefie serwera, nie Warszawy.
// Endpoint /hp/4day liczy granice przez core/time.ts.
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

// Blokadę ocenia się z ostatniej telemetrii (pamięć podręczna), a sam błąd z bazy.
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

// Zapis bez identycznych powtórzeń (core/services/plateau-writer.service.ts). Porównanie pomija czas ze
// sterownika, t_out (serwer) oraz lt_hp_on i lt_pow (w pracy i tak rosną, więc seria to w praktyce postój).
const writeHp = createPlateauWriter(HpEntryModel);
const hpKey = (cast: Record<string, unknown>) => comparisonKey(cast, ['time', 't_out', 'lt_hp_on', 'lt_pow']);

// Zapis rekordu hp: dopisuje t_out (czujnik kotła), rootId, rodzaj, deviceId i ewentualny
// error_code, aktualizuje pamięć podręczną i wysyła WebSocket "update" do klienta.
export const addHpData = async (rootId: string, data :HpEntry) => {
  data.t_out = getTemperature()!;
  const device = await getDeviceInfo(rootId);

  // Porównanie z poprzednim zapisanym odczytem. Czas błędu = czas pierwszego rekordu
  // z nowym ERRn (dokładność 10–30 s, CHPC nie ma zegara).
  const previous = await getHpLastData(rootId) as HpEntry;
  const errorCode = detectErrorEvent(previous, data);

  const dataWithRoot = {
    ...data,
    rootId,
    deviceType: device.deviceType,
    deviceId: device.deviceId,
    ...(errorCode ? { error_code: errorCode } : {}),
  };
  // pamięć podręczna przed zapisem: surowe dane, także pola, które schemat pominie
  lastDataByRoot.set(rootId, dataWithRoot);

  const { doc } = await writeHp(rootId, dataWithRoot as unknown as Record<string, unknown>, hpKey);

  const cachedDates = availableDatesByRoot.get(rootId);
  if (cachedDates) {
    const createdAt = (doc as unknown as { createdAt?: Date }).createdAt ?? new Date();
    const date = formatInTimeZone(createdAt, TIME_ZONE, 'yyyy.MM.dd');
    cachedDates.add(date);
  }

  sendMessage('update', rootId);
  return doc;
}
