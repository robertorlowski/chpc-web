import { DeviceProperties, DeviceType } from '../../core/devices/device.types';
import { WaterMeterReading, WaterPressureRun, WaterTank } from './types';
import { DeviceModel } from '../../core/devices/device.model';
import { WaterMeterReadingModel, WaterPressureRunModel } from './models';
import { getDeviceInfo } from '../../core/device-info';
import { TIME_ZONE } from '../../core/time';

const ATMOSPHERE_BAR = 1.013;

// Uruchomienie jest „w toku”, gdy ostatnia wiadomość sterownika (co 1 s) jest młodsza.
export const RUN_IN_PROGRESS_MS = 5000;

// Ustawienia nowego hydroforu: dwa zbiorniki po 300 l jak w instalacji użytkownika,
// progi presostatu i p0 do poprawienia w Ustawieniach po odczycie z manometru.
export const DEFAULT_WATER_PRESSURE_PROPERTIES: DeviceProperties = {
  compressor_seconds: 30,
  pressure_low: 2,
  pressure_high: 4,
  tanks: [
    { name: 'Ocynkowany', kind: 'air', volumeLiters: 300, enabled: true, k: 1 },
    { name: 'Przeponowy', kind: 'membrane', volumeLiters: 300, enabled: true, precharge: 1.8 },
  ],
};

export const MAX_COMPRESSOR_SECONDS = 3600;

export const isCompressorSeconds = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 1 && (value as number) <= MAX_COMPRESSOR_SECONDS;

// Czas kompresora ustawiony na stronie sterownika. Zmienia tylko to jedno
// pole, bo sterownik nie zna pozostałych ustawień w pełni (np. nazw zbiorników).
export async function setCompressorSeconds(rootId: string, seconds: number): Promise<number | null> {
  const device = await DeviceModel.findOneAndUpdate(
    { _id: rootId, deviceType: DeviceType.WATER_PRESSURE },
    { $set: { 'properties.compressor_seconds': seconds } },
    { new: true },
  ).select('properties.compressor_seconds').lean();
  return device?.properties?.compressor_seconds ?? null;
}

export interface WaterEstimate {
  waterLiters: number;
  waterAirBaseLiters: number;
  waterMembraneLiters: number;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

// Woda wypchnięta między progiem górnym a dolnym presostatu (prawo Boyle'a),
// suma z włączonych zbiorników. Ciśnienia z manometru, we wzorze bezwzględne.
// Poduszka powietrzna: pełna poduszka (powietrze wypełniające zbiornik przy
// ciśnieniu atmosferycznym) razy k. Przepona: ilość powietrza z ciśnienia wstępnego.
export function estimateWater(properties: DeviceProperties | undefined): WaterEstimate {
  const low = Number(properties?.pressure_low);
  const high = Number(properties?.pressure_high);
  const none = { waterLiters: 0, waterAirBaseLiters: 0, waterMembraneLiters: 0 };
  if (!Number.isFinite(low) || !Number.isFinite(high) || high <= low || low < 0) return none;

  const lowAbs = low + ATMOSPHERE_BAR;
  const highAbs = high + ATMOSPHERE_BAR;
  const span = 1 / lowAbs - 1 / highAbs;

  let air = 0;
  let airBase = 0;
  let membrane = 0;
  for (const tank of properties?.tanks ?? []) {
    if (!tank.enabled || !(tank.volumeLiters > 0)) continue;
    if (tank.kind === 'air') {
      const base = tank.volumeLiters * ATMOSPHERE_BAR * span;
      airBase += base;
      air += base * (tank.k ?? 1);
    } else {
      // p0 powyżej progu dolnego: worek oddaje wodę tylko od p0 w górę
      const prechargeAbs = (tank.precharge ?? 0) + ATMOSPHERE_BAR;
      if (prechargeAbs >= highAbs) continue;
      membrane += tank.volumeLiters * prechargeAbs * (1 / Math.max(lowAbs, prechargeAbs) - 1 / highAbs);
    }
  }
  return {
    waterLiters: round1(air + membrane),
    waterAirBaseLiters: round1(airBase),
    waterMembraneLiters: round1(membrane),
  };
}

export interface RunReport {
  runId: number;
  pumpRunS: number;
  compressorStartS?: number;
  compressorEndS?: number;
  restarts?: number;
  queued?: boolean;
}

const isNonNegative = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function validateRunReport(body: unknown): RunReport | null {
  const data = body as Partial<RunReport> | undefined;
  if (!data || !Number.isInteger(data.runId) || (data.runId as number) < 0) return null;
  if (!isNonNegative(data.pumpRunS) || (data.pumpRunS as number) > 24 * 3600) return null;
  for (const key of ['compressorStartS', 'compressorEndS', 'restarts'] as const) {
    if (data[key] !== undefined && data[key] !== null && !isNonNegative(data[key])) return null;
  }
  return {
    runId: data.runId as number,
    pumpRunS: data.pumpRunS as number,
    compressorStartS: data.compressorStartS ?? undefined,
    compressorEndS: data.compressorEndS ?? undefined,
    restarts: data.restarts ?? undefined,
    queued: data.queued === true,
  };
}

const plusSeconds = (base: Date, seconds: number | undefined) =>
  seconds === undefined ? undefined : new Date(base.getTime() + seconds * 1000);

// Zapis wiadomości sterownika. Sterownik nie ma zegara: czasy są względne
// (sekundy od startu), a daty wylicza serwer z chwili odebrania. Pierwsza
// wiadomość uruchomienia ustala pumpStart; kolejne przesuwają pumpEnd, więc
// ostatnia przed utratą zasilania wyznacza koniec pracy pompy.
export async function addWaterPressureReport(rootId: string, report: RunReport, receivedAt = new Date()) {
  const device = await getDeviceInfo(rootId);
  const existing = await WaterPressureRunModel.findOne({ rootId, runId: report.runId }).lean<WaterPressureRun>();

  const pumpStart = existing?.pumpStart
    ?? new Date(receivedAt.getTime() - report.pumpRunS * 1000);
  // Z kolejki przychodzi uruchomienie zakończone dawno: koniec z czasu pracy,
  // na żywo — chwila odebrania.
  const pumpEnd = report.queued ? plusSeconds(pumpStart, report.pumpRunS)! : receivedAt;

  const update: Partial<WaterPressureRun> = {
    pumpEnd,
    lastSeenAt: receivedAt,
    compressorStart: plusSeconds(pumpStart, report.compressorStartS) ?? existing?.compressorStart,
    compressorEnd: plusSeconds(pumpStart, report.compressorEndS) ?? existing?.compressorEnd,
    restarts: report.restarts ?? existing?.restarts ?? 0,
  };

  if (existing) {
    await WaterPressureRunModel.updateOne({ _id: (existing as { _id?: unknown })._id }, { $set: update });
    return { ...existing, ...update };
  }

  const settings = await DeviceModel.findById(rootId).select('properties').lean();
  const estimate = estimateWater(settings?.properties);
  const created = await WaterPressureRunModel.create({
    rootId,
    deviceType: device.deviceType ?? DeviceType.WATER_PRESSURE,
    deviceId: device.deviceId,
    runId: report.runId,
    pumpStart,
    ...update,
    ...estimate,
    timeApproximate: report.queued === true,
  });
  return created.toObject();
}

export const getWaterPressureRuns = (rootId: string, from: Date, to: Date) =>
  WaterPressureRunModel
    .find({ rootId, pumpStart: { $gte: from, $lt: to } })
    .sort({ pumpStart: 1 })
    .lean<WaterPressureRun[]>();

export type SummaryPeriod = 'day' | 'month' | 'year';

export interface SummaryBucket {
  key: number;
  waterLiters: number;
  runs: number;
}

// Woda z uruchomień w przedziale [from, to), w godzinach (day), dniach
// miesiąca (month) albo miesiącach (year) czasu warszawskiego. Puste
// przedziały są uzupełniane zerami, więc klient rysuje oś bez dziur.
export async function getWaterPressureSummary(
  rootId: string, period: SummaryPeriod, from: Date, to: Date, bucketCount: number,
): Promise<SummaryBucket[]> {
  const bucket = period === 'day'
    ? { $hour: { date: '$pumpStart', timezone: TIME_ZONE } }
    : period === 'month'
      ? { $dayOfMonth: { date: '$pumpStart', timezone: TIME_ZONE } }
      : { $month: { date: '$pumpStart', timezone: TIME_ZONE } };

  const rows = await WaterPressureRunModel.aggregate<{ _id: number; waterLiters: number; runs: number }>([
    { $match: { rootId, pumpStart: { $gte: from, $lt: to } } },
    { $group: { _id: bucket, waterLiters: { $sum: '$waterLiters' }, runs: { $sum: 1 } } },
  ]);
  const byKey = new Map(rows.map((row) => [row._id, row]));
  const first = period === 'day' ? 0 : 1;
  return Array.from({ length: bucketCount }, (_, index) => {
    const key = first + index;
    const row = byKey.get(key);
    return { key, waterLiters: round1(row?.waterLiters ?? 0), runs: row?.runs ?? 0 };
  });
}

// --- wodomierz ---

export const listWaterMeterReadings = (rootId: string) =>
  WaterMeterReadingModel.find({ rootId }).sort({ readAt: 1 }).lean<(WaterMeterReading & { _id: unknown })[]>();

export async function addWaterMeterReading(rootId: string, reading: { readAt: Date; valueM3: number; note?: string }) {
  const created = await WaterMeterReadingModel.create({ rootId, ...reading });
  return created.toObject();
}

export async function deleteWaterMeterReading(rootId: string, id: string) {
  const result = await WaterMeterReadingModel.deleteOne({ _id: id, rootId });
  return result.deletedCount > 0;
}

interface EstimateTotals {
  waterLiters: number;
  airBase: number;
  membrane: number;
}

const sumEstimates = (runs: WaterPressureRun[], from: Date, to: Date): EstimateTotals =>
  runs
    .filter((run) => run.pumpStart >= from && run.pumpStart < to)
    .reduce((acc, run) => ({
      waterLiters: acc.waterLiters + (run.waterLiters ?? 0),
      airBase: acc.airBase + (run.waterAirBaseLiters ?? 0),
      membrane: acc.membrane + (run.waterMembraneLiters ?? 0),
    }), { waterLiters: 0, airBase: 0, membrane: 0 });

// k, przy którym suma szacunków zgadza się z wodomierzem: k popraw tylko
// zbiorniki z poduszką, przepona liczy się z p0.
const suggestK = (meterLiters: number, totals: EstimateTotals) =>
  totals.airBase > 0 && meterLiters > 0
    ? Math.round(((meterLiters - totals.membrane) / totals.airBase) * 100) / 100
    : null;

export interface MeterPeriod {
  from: Date;
  to: Date;
  meterLiters: number;
  estimatedLiters: number;
}

// Zużycie między kolejnymi odczytami i w miesiącach roku. Stan wodomierza
// między odczytami jest interpolowany liniowo, więc okres rozciągnięty na
// dwa miesiące dzieli się proporcjonalnie do czasu.
export async function getWaterMeterSummary(rootId: string, year: number, monthStarts: Date[]) {
  const readings = await listWaterMeterReadings(rootId);
  if (readings.length < 2) {
    return { periods: [] as MeterPeriod[], months: [], suggestedK: null };
  }

  const first = readings[0].readAt;
  const last = readings[readings.length - 1].readAt;
  const runs = await getWaterPressureRuns(rootId, first, last);

  const meterAt = (time: Date) => {
    for (let index = 1; index < readings.length; index++) {
      const previous = readings[index - 1];
      const next = readings[index];
      if (time <= next.readAt) {
        const span = next.readAt.getTime() - previous.readAt.getTime();
        const ratio = span > 0 ? (time.getTime() - previous.readAt.getTime()) / span : 1;
        return previous.valueM3 + (next.valueM3 - previous.valueM3) * ratio;
      }
    }
    return readings[readings.length - 1].valueM3;
  };

  const periods: MeterPeriod[] = readings.slice(1).map((reading, index) => {
    const previous = readings[index];
    return {
      from: previous.readAt,
      to: reading.readAt,
      meterLiters: round1((reading.valueM3 - previous.valueM3) * 1000),
      estimatedLiters: round1(sumEstimates(runs, previous.readAt, reading.readAt).waterLiters),
    };
  });

  const months = monthStarts.slice(0, -1).map((monthStart, index) => {
    const monthEnd = monthStarts[index + 1];
    const from = monthStart > first ? monthStart : first;
    const to = monthEnd < last ? monthEnd : last;
    if (to <= from) return { month: index + 1, meterLiters: null, estimatedLiters: null };
    return {
      month: index + 1,
      meterLiters: round1((meterAt(to) - meterAt(from)) * 1000),
      estimatedLiters: round1(sumEstimates(runs, from, to).waterLiters),
    };
  });

  const meterTotal = (readings[readings.length - 1].valueM3 - readings[0].valueM3) * 1000;
  return {
    year,
    periods,
    months,
    suggestedK: suggestK(meterTotal, sumEstimates(runs, first, last)),
  };
}

export type { WaterTank };
