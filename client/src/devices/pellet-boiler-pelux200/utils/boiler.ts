// Pomocnicze funkcje widoków kotła pelletowego: nazwy stanów, formaty, nieaktualność, CSV.
import { PelletBoilerReading } from '../types';

const TIME_ZONE = 'Europe/Warsaw';

export const DEFAULT_POLL_SECONDS = 300;

// Nazwy stanów 0..11 z regulatora ecoMAX.
export const BOILER_STATE_NAMES = [
  'Wyłączony', 'Stabilizacja', 'Rozpalanie', 'Praca', 'Nadzór', 'Pauza',
  'Czuwanie', 'Wygaszanie', 'Alarm', 'Ręczny', 'Rozszczelnianie', 'Inny',
];

export const stateName = (state?: number) =>
  state === undefined ? '---' : (BOILER_STATE_NAMES[state] ?? `Stan ${state}`);

export const formatNumber = (value: number | undefined, digits = 1) =>
  value === undefined || value === null ? '---' : value.toLocaleString('pl-PL', { maximumFractionDigits: digits });

export const formatTemp = (value?: number) => value === undefined || value === null ? '---' : `${formatNumber(value)} °C`;
export const formatPercent = (value?: number) => value === undefined || value === null ? '---' : `${formatNumber(value, 0)} %`;

export const formatTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString('pl-PL', { timeZone: TIME_ZONE }) : '---';
export const formatDateTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('pl-PL', { timeZone: TIME_ZONE }) : '---';

export const onOff = (value?: boolean) => value === undefined || value === null ? '---' : value ? 'włączona' : 'wyłączona';

// Dzisiejsza data w Warszawie jako YYYY-MM-DD (format en-CA).
export const todayWarsaw = () => new Date().toLocaleDateString('en-CA', { timeZone: TIME_ZONE });

// Odczyt nieaktualny: starszy niż 3 interwały odpytywania (albo bez czasu).
export const isStale = (createdAt: string | undefined, pollSeconds: number) =>
  !createdAt || Date.now() - new Date(createdAt).getTime() > 3 * pollSeconds * 1000;

const num = (value?: number) => value === undefined || value === null ? '' : String(value).replace('.', ',');

// CSV dla Excela z polskimi ustawieniami: separator ';', przecinek dziesiętny.
export const readingsToCsv = (readings: PelletBoilerReading[]) => {
  const header = ['Czas', 'Stan', 'Kocioł [°C]', 'CWU [°C]', 'Zewn. [°C]', 'Spaliny [°C]', 'Powrót [°C]',
    'Paliwo [%]', 'Wentylator [%]', 'Moc [kW]', 'Pompa CO', 'Pompa CWU'];
  const rows = readings.map((r) => [
    formatDateTime(r.createdAt), stateName(r.state), num(r.heating_temp), num(r.water_heater_temp),
    num(r.outside_temp), num(r.exhaust_temp), num(r.return_temp), num(r.fuel_level), num(r.fan_power),
    num(r.boiler_power), r.heating_pump ? 'tak' : 'nie', r.water_heater_pump ? 'tak' : 'nie',
  ].join(';'));
  return [header.join(';'), ...rows].join('\n');
};

export const downloadText = (content: string, fileName: string) => {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};
