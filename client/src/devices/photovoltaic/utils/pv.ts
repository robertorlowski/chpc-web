// Formaty fotowoltaiki (czas warszawski, polskie liczby), nazwy stanów paneli i CSV.
import { PvPanelState } from '../types';

const TIME_ZONE = 'Europe/Warsaw';

export const todayWarsaw = () => new Date().toLocaleDateString('en-CA', { timeZone: TIME_ZONE });

// dzień (YYYY-MM-DD) chwili ISO w czasie warszawskim
export const warsawDay = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TIME_ZONE });

const number = (value: number, digits: number) => value.toLocaleString('pl-PL', { maximumFractionDigits: digits });

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

export const formatTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString('pl-PL', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' }) : '---';

export const formatDateTime = (iso?: string) => (iso ? new Date(iso).toLocaleString('pl-PL', { timeZone: TIME_ZONE }) : '---');

// 2026-05-08 → 8.05.2026
export const formatDay = (day?: string) => {
  if (!day) return '---';
  const [y, m, d] = day.split('-');
  return `${Number(d)}.${m}.${y}`;
};

export const STATE_LABELS: Record<PvPanelState, string> = {
  produces: 'produkuje',
  idle: 'bez produkcji',
  offline: 'brak łączności',
  alarm: 'alarm',
};

// numer seryjny mikrofalownika w skrócie (ostatnie 4 cyfry), jak na tabliczce w S-Miles
export const shortSerial = (serial: string) => `…${serial.slice(-4)}`;

export const panelName = (serial: string, port: number) => `${shortSerial(serial)} port ${port}`;

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
