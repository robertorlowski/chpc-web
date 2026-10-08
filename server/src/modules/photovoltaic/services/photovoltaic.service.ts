// Widoki fotowoltaiki liczone z odczytów DTU Hoymiles, które wysyła sterownik co (pompa ciepła):
// kolekcja pv (co 60 s, od 2026-09-26, z panelami przez 90 dni) i starsza historia w rekordach hp
// (PV: total_power, total_prod, total_prod_today, temperature — do 2026-09-26).
//
// Urządzenie „photovoltaic” ma ten sam SN co sterownik pompy ciepła; odczyty leżą pod rootId pompy,
// więc źródło to urządzenie heat_pump o tym samym deviceId. Moduł tylko czyta: kolekcje pv i hp
// przez sterownik bazy (bez modeli modułu pompy — moduły nie importują siebie nawzajem).
// Dzień z odczytami pv bierze dane z pv, dzień bez nich — z podsumowania PV w hp.
import mongoose from 'mongoose';
import { DeviceModel } from '../../../core/models/device.model';
import { DeviceType } from '../../../core/types';
import { getDeviceInfo } from '../../../core/services/device-info.service';
import { TIME_ZONE, warsawDayBoundsUTC } from '../../../core/time';
import {
  PvCurrentView, PvDayPoint, PvDayView, PvPanel, PvSummaryBucket, PvSummaryView,
} from '../types';

// odczyt starszy = moc i stany paneli nieaktualne (DTU czytane co 60 s)
export const STALE_AFTER_MS = 5 * 60 * 1000;
const BUCKET_MS = 5 * 60 * 1000;

type RawPanel = Omit<PvPanel, 'key' | 'state'>;
interface Sample {
  at: Date;
  power?: number;
  temperature?: number;
  todayWh?: number;
  totalWh?: number;
  panels?: RawPanel[];
}

const pvCollection = () => mongoose.connection.collection('pv');
const hpCollection = () => mongoose.connection.collection('hp');

// rootId urządzenia pompy ciepła o tym samym SN co urządzenie fotowoltaiki; null, gdy brak
export async function sourceRootId(rootId: string): Promise<string | null> {
  const { deviceId } = await getDeviceInfo(rootId);
  const heatPump = await DeviceModel.findOne({ deviceType: DeviceType.HP, deviceId }).select('_id').lean();
  return heatPump ? String(heatPump._id) : null;
}

// Temperatura instalacji: najniższa z portów, które odpowiadają. Mikrofalownik bez łącza (wieczorem, w nocy) podaje 0 °C,
// a to nie jest temperatura, więc taki port jest pomijany; bez żadnego odpowiadającego portu temperatury nie ma.
const pvTemperature = (doc: Record<string, any>): number | undefined => {
  const reported = Array.isArray(doc.panels) ? doc.panels.filter((p: RawPanel) => typeof p.temperature === 'number') : [];
  if (reported.length === 0) return doc.temperature;
  const online = reported
    .filter((p: RawPanel) => (p.link === undefined || p.link === 1) && typeof p.temperature === 'number' && p.temperature > 0)
    .map((p: RawPanel) => p.temperature as number);
  return online.length ? Math.min(...online) : undefined;
};

// Rekord pv albo hp → jedna postać próbki.
const fromPv = (doc: Record<string, any>): Sample => ({
  at: doc.createdAt, power: doc.total_power, temperature: pvTemperature(doc),
  todayWh: doc.total_prod_today, totalWh: doc.total_prod, panels: doc.panels,
});
const fromHp = (doc: Record<string, any>): Sample => ({
  at: doc.createdAt, power: doc.PV?.total_power, temperature: doc.PV?.temperature,
  todayWh: doc.PV?.total_prod_today, totalWh: doc.PV?.total_prod,
});

export const panelKey = (panel: { serial: string; port: number }) => `${panel.serial}-${panel.port}`;

// Stan panelu z odczytu: brak łącza z DTU, alarm, produkcja albo czuwanie (noc, zachmurzenie).
export function panelState(panel: RawPanel): PvPanel['state'] {
  if (panel.link !== undefined && panel.link !== 1) return 'offline';
  if (panel.alarm_code) return 'alarm';
  return (panel.power ?? 0) > 0 ? 'produces' : 'idle';
}

const toPanels = (panels: RawPanel[] | undefined): PvPanel[] =>
  (panels ?? []).map((panel) => ({ ...panel, key: panelKey(panel), state: panelState(panel) }));

const warsawDate = (date: Date) => date.toLocaleDateString('en-CA', { timeZone: TIME_ZONE });

async function latest(src: string) {
  const [pv, hp] = await Promise.all([
    pvCollection().find({ rootId: src }).sort({ createdAt: -1 }).limit(1).next(),
    hpCollection().find({ rootId: src, 'PV.total_prod': { $gt: 0 } }).sort({ createdAt: -1 }).limit(1).next(),
  ]);
  if (pv && (!hp || pv.createdAt >= hp.createdAt)) return fromPv(pv);
  return hp ? fromHp(hp) : undefined;
}

// Pierwszy odczyt w miesiącu (YYYY-MM) z licznikiem całkowitym — punkt odniesienia produkcji miesięcznej.
async function firstInMonth(src: string, month: string) {
  const { startUTC } = warsawDayBoundsUTC(`${month}-01`);
  const match = { rootId: src, createdAt: { $gte: startUTC } };
  const [pv, hp] = await Promise.all([
    pvCollection().find({ ...match, total_prod: { $gt: 0 } }).sort({ createdAt: 1 }).limit(1).next(),
    hpCollection().find({ ...match, 'PV.total_prod': { $gt: 0 } }).sort({ createdAt: 1 }).limit(1).next(),
  ]);
  if (hp && (!pv || hp.createdAt <= pv.createdAt)) return fromHp(hp);
  return pv ? fromPv(pv) : undefined;
}

// Licznik dzienny DTU spada do 0 dla mikrofalownika, który wieczorem przestał odpowiadać (produkcja dnia „znika”),
// więc produkcja dziś to największy licznik z dnia ostatniego odczytu: łączny i każdego portu.
async function applyDayMaximum(src: string, last: Sample): Promise<Sample> {
  if (!last.panels) return last;
  const { startUTC } = warsawDayBoundsUTC(warsawDate(last.at));
  const match = { rootId: src, createdAt: { $gte: startUTC, $lte: last.at } };
  const [total] = await pvCollection()
    .aggregate([{ $match: match }, { $group: { _id: null, today: { $max: '$total_prod_today' } } }])
    .toArray();
  const ports = await pvCollection()
    .aggregate([
      { $match: match },
      { $unwind: '$panels' },
      { $group: { _id: { serial: '$panels.serial', port: '$panels.port' }, today: { $max: '$panels.prod_today' } } },
    ])
    .toArray();
  const byPort = new Map(ports.map((p) => [`${p._id.serial}-${p._id.port}`, p.today as number | undefined]));
  return {
    ...last,
    todayWh: Math.max(last.todayWh ?? 0, total?.today ?? 0),
    panels: last.panels.map((panel) => {
      const max = byPort.get(panelKey(panel));
      return max === undefined ? panel : { ...panel, prod_today: Math.max(panel.prod_today ?? 0, max) };
    }),
  };
}

export async function getCurrentView(rootId: string, now = new Date()): Promise<PvCurrentView> {
  const src = await sourceRootId(rootId);
  const latestSample = src ? await latest(src) : undefined;
  if (!src || !latestSample) return { stale: true, panels: [], panelsAvailable: false };
  const last = await applyDayMaximum(src, latestSample);
  const base = await firstInMonth(src, warsawDate(last.at).slice(0, 7));
  // licznik na początku miesiąca = licznik pierwszego odczytu miesiąca − produkcja dnia do tego odczytu
  const baseTotal = base?.totalWh !== undefined ? base.totalWh - (base.todayWh ?? 0) : undefined;
  return {
    readAt: last.at.toISOString(),
    stale: now.getTime() - last.at.getTime() > STALE_AFTER_MS,
    power: last.power,
    todayWh: last.todayWh,
    totalWh: last.totalWh,
    monthWh: last.totalWh !== undefined && baseTotal !== undefined ? last.totalWh - baseTotal : undefined,
    monthFrom: base ? warsawDate(base.at) : undefined,
    temperature: last.temperature,
    panels: toPanels(last.panels),
    panelsAvailable: (last.panels?.length ?? 0) > 0,
  };
}

async function daySamples(src: string, date: string): Promise<Sample[]> {
  const { startUTC, endUTC } = warsawDayBoundsUTC(date);
  const match = { rootId: src, createdAt: { $gte: startUTC, $lt: endUTC } };
  const pv = await pvCollection().find(match).sort({ createdAt: 1 }).toArray();
  if (pv.length) return pv.map(fromPv);
  const hp = await hpCollection()
    .find({ ...match, 'PV.total_power': { $exists: true } })
    .project({ createdAt: 1, PV: 1 })
    .sort({ createdAt: 1 })
    .toArray();
  return hp.map(fromHp);
}

const average = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;

export async function getDayView(rootId: string, date: string): Promise<PvDayView> {
  const src = await sourceRootId(rootId);
  const samples = src ? await daySamples(src, date) : [];
  const buckets = new Map<number, Sample[]>();
  for (const sample of samples) {
    const bucket = Math.floor(sample.at.getTime() / BUCKET_MS) * BUCKET_MS;
    buckets.set(bucket, [...(buckets.get(bucket) ?? []), sample]);
  }
  const points: PvDayPoint[] = [];
  const panelPoints = new Map<string, { serial: string; port: number; energyWh?: number; points: { t: string; power: number }[] }>();
  for (const [bucket, group] of [...buckets].sort((a, b) => a[0] - b[0])) {
    const t = new Date(bucket).toISOString();
    const powers = group.map((s) => s.power).filter((v): v is number => v !== undefined);
    const temps = group.map((s) => s.temperature).filter((v): v is number => v !== undefined);
    const today = group.map((s) => s.todayWh).filter((v): v is number => v !== undefined);
    points.push({
      t,
      power: powers.length ? Math.round(average(powers)) : 0,
      temperature: temps.length ? Math.round(average(temps) * 10) / 10 : undefined,
      todayWh: today.length ? Math.max(...today) : undefined,
    });
    const byPanel = new Map<string, number[]>();
    for (const sample of group) {
      for (const panel of sample.panels ?? []) {
        const key = panelKey(panel);
        if (!panelPoints.has(key)) panelPoints.set(key, { serial: panel.serial, port: panel.port, points: [] });
        byPanel.set(key, [...(byPanel.get(key) ?? []), panel.power ?? 0]);
        // produkcja panelu w dniu = największy licznik dzienny portu
        const entry = panelPoints.get(key)!;
        if (panel.prod_today !== undefined) entry.energyWh = Math.max(entry.energyWh ?? 0, panel.prod_today);
      }
    }
    for (const [key, values] of byPanel) panelPoints.get(key)!.points.push({ t, power: Math.round(average(values)) });
  }
  const peak = samples.reduce<Sample | undefined>((best, s) => ((s.power ?? 0) > (best?.power ?? -1) ? s : best), undefined);
  const today = samples.map((s) => s.todayWh).filter((v): v is number => v !== undefined);
  return {
    date,
    points,
    panels: [...panelPoints].map(([key, value]) => ({ key, ...value })).sort((a, b) => a.key.localeCompare(b.key)),
    energyWh: today.length ? Math.max(...today) : undefined,
    peakW: peak?.power,
    peakAt: peak?.at.toISOString(),
  };
}

// Produkcja dnia = największe total_prod_today w dobie warszawskiej; szczyt = największa moc.
async function dailyEnergy(src: string, start?: Date, end?: Date) {
  const createdAt = start && end ? { createdAt: { $gte: start, $lt: end } } : {};
  const day = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: TIME_ZONE } };
  const [pv, hp] = await Promise.all([
    pvCollection().aggregate([
      { $match: { rootId: src, ...createdAt } },
      { $group: { _id: day, energy: { $max: '$total_prod_today' }, peak: { $max: '$total_power' } } },
    ]).toArray(),
    hpCollection().aggregate([
      { $match: { rootId: src, ...createdAt, 'PV.total_prod_today': { $exists: true } } },
      { $group: { _id: day, energy: { $max: '$PV.total_prod_today' }, peak: { $max: '$PV.total_power' } } },
    ]).toArray(),
  ]);
  const days = new Map<string, { energy: number; peak?: number }>();
  for (const row of hp) if (row.energy !== null) days.set(row._id, { energy: row.energy, peak: row.peak ?? undefined });
  for (const row of pv) if (row.energy !== null) days.set(row._id, { energy: row.energy, peak: row.peak ?? undefined });
  return days;
}

// month: dni miesiąca (date = YYYY-MM), year: miesiące (YYYY), total: lata.
export async function getSummaryView(
  rootId: string, period: PvSummaryView['period'], date: string,
): Promise<PvSummaryView> {
  const src = await sourceRootId(rootId);
  let start: Date | undefined;
  let end: Date | undefined;
  if (period === 'month') {
    const [y, m] = date.split('-').map(Number);
    start = warsawDayBoundsUTC(`${date}-01`).startUTC;
    end = warsawDayBoundsUTC(m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`).startUTC;
  } else if (period === 'year') {
    start = warsawDayBoundsUTC(`${date}-01-01`).startUTC;
    end = warsawDayBoundsUTC(`${Number(date) + 1}-01-01`).startUTC;
  }
  const days = src ? await dailyEnergy(src, start, end) : new Map();
  const keyOf = (day: string) => (period === 'month' ? day : period === 'year' ? day.slice(0, 7) : day.slice(0, 4));
  const buckets = new Map<string, PvSummaryBucket>();
  for (const [day, value] of days) {
    const key = keyOf(day);
    const bucket = buckets.get(key) ?? { key, energyWh: 0, peakW: undefined, days: 0 };
    bucket.energyWh += value.energy;
    bucket.peakW = Math.max(bucket.peakW ?? 0, value.peak ?? 0);
    bucket.days += 1;
    buckets.set(key, bucket);
  }
  const list = [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key));
  return { period, date, buckets: list, energyWh: list.reduce((sum, b) => sum + b.energyWh, 0) };
}

// Zakładka Dane: odczyty dnia od najnowszego, najwyżej jeden na minutę. Bez panelu — całość,
// z panelem (serial-port) — jego wartości (tylko dni z odczytami pv).
export async function getReadings(rootId: string, date: string, panel?: string) {
  const src = await sourceRootId(rootId);
  const samples = src ? await daySamples(src, date) : [];
  const seen = new Set<number>();
  const rows: Record<string, unknown>[] = [];
  for (const sample of [...samples].reverse()) {
    const minute = Math.floor(sample.at.getTime() / 60000);
    if (seen.has(minute)) continue;
    seen.add(minute);
    if (!panel) {
      rows.push({
        t: sample.at.toISOString(), power: sample.power, todayWh: sample.todayWh,
        totalWh: sample.totalWh, temperature: sample.temperature,
      });
      continue;
    }
    const found = sample.panels?.find((p) => panelKey(p) === panel);
    if (found) rows.push({ t: sample.at.toISOString(), ...found, state: panelState(found) });
  }
  return rows;
}

// Mikrofalowniki z ostatniego odczytu z panelami: numer, porty, model z numeru seryjnego.
export async function getInverters(rootId: string) {
  const src = await sourceRootId(rootId);
  const last = src ? await pvCollection().find({ rootId: src, 'panels.0': { $exists: true } })
    .sort({ createdAt: -1 }).limit(1).next() : null;
  const panels = toPanels(last?.panels);
  const bySerial = new Map<string, PvPanel[]>();
  for (const panel of panels) bySerial.set(panel.serial, [...(bySerial.get(panel.serial) ?? []), panel]);
  return {
    readAt: last?.createdAt?.toISOString(),
    inverters: [...bySerial].map(([serial, ports]) => ({
      serial,
      model: inverterModel(serial),
      ports: ports.map((p) => ({
        port: p.port, prodTotalWh: p.prod_total, status: p.status, link: p.link,
        alarm_code: p.alarm_code, alarm_count: p.alarm_count, state: p.state,
      })),
      prodTotalWh: ports.reduce((sum, p) => sum + (p.prod_total ?? 0), 0),
      grid_voltage: ports[0]?.grid_voltage,
      grid_frequency: ports[0]?.grid_frequency,
      temperature: ports[0]?.temperature,
    })),
  };
}

// Seria z początku numeru seryjnego Hoymiles, jak w OpenDTU (lib/Hoymiles, rozpoznawanie typu):
// 1121/1141/1161 — HM 1/2/4 porty, 1124/1144/1164 — HMS 1/2/4 porty. Model z mocą tylko z tabliczki.
const SERIES: [string, string][] = [
  ['1121', 'HM-300/350/400 (1 port)'],
  ['1141', 'HM-600/700/800 (2 porty)'],
  ['1161', 'HM-1000/1200/1500 (4 porty)'],
  ['1124', 'HMS-300…500-1T (1 port)'],
  ['1144', 'HMS-600…1000-2T (2 porty)'],
  ['1164', 'HMS-1600/1800/2000-4T (4 porty)'],
];

export function inverterModel(serial: string): string | undefined {
  return SERIES.find(([prefix]) => serial.startsWith(prefix))?.[1];
}
