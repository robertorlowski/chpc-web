// Formaty fotowoltaiki (czas warszawski, polskie liczby), liczba i jednostka osobno (hero i KPI wyglądu „Instrument”),
// nazwy miesięcy i przesuwanie dat (nawigacja po dacie), nazwy stanów paneli, odmiana liczebników i CSV.
import { PvPanelState } from '../types';
import { getLang, locale, t as tr, tn } from '../../../core/i18n';

const TIME_ZONE = 'Europe/Warsaw';
const loc = () => locale(getLang());

export const todayWarsaw = () => new Date().toLocaleDateString('en-CA', { timeZone: TIME_ZONE });

// dzień (YYYY-MM-DD) chwili ISO w czasie warszawskim
export const warsawDay = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TIME_ZONE });

const number = (value: number, digits: number) => value.toLocaleString(loc(), { maximumFractionDigits: digits });

export const formatPower = (watts?: number) =>
  watts === undefined || watts === null ? '---' : watts >= 1000 ? `${number(watts / 1000, 2)} kW` : `${number(watts, 0)} W`;

// energia: Wh do 1 kWh, potem kWh, od 10 MWh w MWh
export const formatEnergy = (wh?: number) => {
  if (wh === undefined || wh === null) return '---';
  if (wh < 1000) return `${number(wh, 0)} Wh`;
  if (wh < 10_000_000) return `${number(wh / 1000, 1)} kWh`;
  return `${number(wh / 1_000_000, 2)} MWh`;
};

export const formatTemp = (value?: number) => (value === undefined || value === null ? '---' : `${number(value, 1)} °C`);

// liczba i jednostka osobno: hero („2,41” + „kW”) i KPI makiety; bez wartości „---” i pusta jednostka
export type NumberUnit = [string, string];

export const splitPower = (watts?: number): NumberUnit =>
  watts === undefined || watts === null ? ['---', ''] : watts >= 1000 ? [number(watts / 1000, 2), 'kW'] : [number(watts, 0), 'W'];

export const splitEnergy = (wh?: number): NumberUnit => {
  if (wh === undefined || wh === null) return ['---', ''];
  if (wh < 1000) return [number(wh, 0), 'Wh'];
  if (wh < 10_000_000) return [number(wh / 1000, 1), 'kWh'];
  return [number(wh / 1_000_000, 2), 'MWh'];
};

export const splitTemp = (value?: number): NumberUnit => (value === undefined || value === null ? ['---', ''] : [number(value, 0), '°C']);

// odmiana ze słownika: plural(3, 'pv.n.panels') → „3 panele” (klucze pv.n.<nazwa>.one/.few/.many)
export const plural = (count: number, key: string) => tn(key, count);

export const formatTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString(loc(), { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' }) : '---';

export const formatDateTime = (iso?: string) => (iso ? new Date(iso).toLocaleString(loc(), { timeZone: TIME_ZONE }) : '---');

// 2026-05-08 → 8.05.2026
export const formatDay = (day?: string) => {
  if (!day) return '---';
  const [y, m, d] = day.split('-');
  return `${Number(d)}.${m}.${y}`;
};

// 2026-10 → „październik 2026”
export const formatMonth = (yearMonth: string) =>
  new Date(`${yearMonth.slice(0, 7)}-01T12:00:00`).toLocaleDateString(loc(), { month: 'long', year: 'numeric' });

// skrót miesiąca (1–12) w języku aplikacji, bez kropki
export const monthShort = (month: number) => new Date(2026, month - 1, 1).toLocaleDateString(loc(), { month: 'short' }).replace('.', '');

// data YYYY-MM-DD przesunięta o n dni, miesięcy albo lat (miesiąc i rok: zawsze pierwszy dzień)
export const shiftDate = (day: string, unit: 'day' | 'month' | 'year', n: number) => {
  const [y, m, d] = day.split('-').map(Number);
  const date = unit === 'day' ? new Date(y, m - 1, d + n) : unit === 'month' ? new Date(y, m - 1 + n, 1) : new Date(y + n, 0, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export const stateLabel = (state: PvPanelState) => tr(`pv.state.${state}`);

// numer seryjny mikrofalownika w skrócie (ostatnie 4 cyfry), jak na tabliczce w S-Miles
export const shortSerial = (serial: string) => `…${serial.slice(-4)}`;

export const panelName = (serial: string, port: number) => `${shortSerial(serial)} ${tr('pv.port')} ${port}`;

export const toCsv = (header: string[], rows: (string | number | undefined)[][]) =>
  [header, ...rows].map((row) => row.map((cell) => (cell === undefined ? '' : String(cell).replace('.', ','))).join(';')).join('\n');

export const downloadText = (content: string, fileName: string) => {
  const blob = new Blob([`﻿${content}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};
