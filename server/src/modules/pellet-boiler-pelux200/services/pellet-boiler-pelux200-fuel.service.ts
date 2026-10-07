// Spalony pellet w okresach (GET /pellet-boiler-pelux200/fuel, firmware pieca od 1.7.1). Sterownik wysyła w każdym
// odczycie narastający stan licznika fuel_burned_kg (fuel_meter.hpp: zużycie kg/h z regulatora × czas, jak PyPlumIO);
// zużycie w przedziale to suma przyrostów między kolejnymi odczytami, przypisanych do chwili późniejszego odczytu.
// Spadek stanu = nowy licznik (wymiana płytki, skasowane NVS): przyrostem jest wtedy cały nowy stan. Przedziały:
// godziny dnia (day), dni miesiąca (month) albo miesiące roku (year) czasu warszawskiego, puste uzupełnione zerami.
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { TIME_ZONE, warsawDayBoundsUTC } from '../../../core/time';
import { PelletBoilerPelux200Model } from '../models/pellet-boiler-pelux200.model';

export type FuelPeriod = 'day' | 'month' | 'year';
export type FuelBucket = { key: number; kg: number };

const warsawMidnight = (year: number, month: number, day: number) =>
  fromZonedTime(new Date(year, month - 1, day, 0, 0, 0), TIME_ZONE);

// Zakres [from, to) i liczba przedziałów okresu zawierającego date (YYYY-MM-DD); null przy złych danych.
export function fuelWindow(period: unknown, date: unknown): { from: Date; to: Date; buckets: number } | null {
  const match = typeof date === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(date) : null;
  if (!match || (period !== 'day' && period !== 'month' && period !== 'year')) return null;
  const [year, month] = [Number(match[1]), Number(match[2])];
  if (period === 'day') {
    const { startUTC, endUTC } = warsawDayBoundsUTC(date as string);
    return { from: startUTC, to: endUTC, buckets: 24 };
  }
  if (period === 'month') {
    const to = month === 12 ? warsawMidnight(year + 1, 1, 1) : warsawMidnight(year, month + 1, 1);
    return { from: warsawMidnight(year, month, 1), to, buckets: new Date(Date.UTC(year, month, 0)).getUTCDate() };
  }
  return { from: warsawMidnight(year, 1, 1), to: warsawMidnight(year + 1, 1, 1), buckets: 12 };
}

const round3 = (value: number) => Math.round(value * 1000) / 1000;

export async function getFuelSummary(rootId: string, period: FuelPeriod, from: Date, to: Date, bucketCount: number) {
  const hasCounter = { fuel_burned_kg: { $type: 'number' } };
  const [before, rows] = await Promise.all([
    PelletBoilerPelux200Model.findOne({ rootId, createdAt: { $lt: from }, ...hasCounter })
      .sort({ createdAt: -1 }).select('fuel_burned_kg').lean<{ fuel_burned_kg: number }>(),
    PelletBoilerPelux200Model.find({ rootId, createdAt: { $gte: from, $lt: to }, ...hasCounter })
      .sort({ createdAt: 1 }).select('fuel_burned_kg createdAt').lean<{ fuel_burned_kg: number; createdAt: Date }[]>(),
  ]);
  const format = period === 'day' ? 'H' : period === 'month' ? 'd' : 'M';
  const first = period === 'day' ? 0 : 1;
  const sums = new Array<number>(bucketCount).fill(0);
  let last: number | null = before?.fuel_burned_kg ?? null;
  for (const row of rows) {
    if (last !== null) {
      const delta = row.fuel_burned_kg >= last ? row.fuel_burned_kg - last : row.fuel_burned_kg;
      const index = Number(formatInTimeZone(row.createdAt, TIME_ZONE, format)) - first;
      if (index >= 0 && index < bucketCount) sums[index] += delta;
    }
    last = row.fuel_burned_kg;
  }
  const buckets: FuelBucket[] = sums.map((kg, index) => ({ key: first + index, kg: round3(kg) }));
  return { buckets, totalKg: round3(sums.reduce((total, kg) => total + kg, 0)), counterKg: last };
}
