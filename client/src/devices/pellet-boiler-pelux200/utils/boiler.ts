// Pomocnicze funkcje widoków kotła pelletowego: nazwy stanów, formaty, nieaktualność, CSV.
import { PelletBoilerParameter, PelletBoilerReading, PelletBoilerSettings } from '../types';

const TIME_ZONE = 'Europe/Warsaw';

// odczyt kotła co minutę (domyślne poll_interval_seconds od 2026-10-05)
export const DEFAULT_POLL_SECONDS = 60;

// Nazwy stanów 0..11 z regulatora ecoMAX (5 = „Postój”, jak na panelu ecoMAX).
export const BOILER_STATE_NAMES = [
  'Wyłączony', 'Stabilizacja', 'Rozpalanie', 'Praca', 'Nadzór', 'Postój',
  'Czuwanie', 'Wygaszanie', 'Alarm', 'Ręczny', 'Rozszczelnianie', 'Inny',
];

export const stateName = (state?: number) =>
  state === undefined ? '---' : (BOILER_STATE_NAMES[state] ?? `Stan ${state}`);

// Tryb „Pompa ciepła” i pracująca sprężarka pompy ciepła (heat_pump_running z serwera): „Praca” zamiast stanu
// regulatora (zwykle Postój), poza stanem Wyłączony i Alarm (decyzja użytkownika 2026-10-05).
export const heatPumpWorking = (reading?: Pick<PelletBoilerReading, 'state' | 'heat_pump_running'> | null) =>
  !!reading?.heat_pump_running && reading.state !== undefined && reading.state !== 0 && reading.state !== 8;

export const readingStateName = (reading?: Pick<PelletBoilerReading, 'state' | 'heat_pump_running'> | null) =>
  heatPumpWorking(reading) ? 'Praca' : stateName(reading?.state);

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

// Parametr kotła (ramka 0x33) z ostatniego odczytu ustawień, po numerze.
export const findParameter = (settings: PelletBoilerSettings | null, index: number): PelletBoilerParameter | undefined =>
  settings?.groups?.flatMap((group) => group.parameters).find((parameter) => parameter.index === index);

// Tryb LATO (nr 125): kolejność 0 Zima / 1 Lato / 2 Auto jak w PyPlumIO, na kotle niepotwierdzona
// (0 przy grzaniu CO pasuje do Zimy).
const SUMMER_MODES = ['Zima', 'Lato', 'Auto'];
export const summerModeName = (settings: PelletBoilerSettings | null) => {
  const parameter = findParameter(settings, 125);
  return parameter ? (SUMMER_MODES[parameter.value] ?? `${parameter.value}`) : '---';
};

// Tryb pracy z ustawień (kociol-ustawienia.md, punkt 4b): minimalna temperatura kotła (nr 99)
// 30 °C w zestawie „bez palenia” (pompa ciepła), 65 °C przy pracy na pellecie. Granica 50 °C.
export const workModeName = (settings: PelletBoilerSettings | null) => {
  const parameter = findParameter(settings, 99);
  return parameter ? (parameter.value < 50 ? 'Pompa ciepła' : 'Pellet') : '---';
};

// Kocioł się pali: stabilizacja, rozpalanie, praca, nadzór i wygaszanie (płomień na stronie głównej).
const BURNING_STATES = [1, 2, 3, 4, 7];
export const isBurning = (state?: number) => state !== undefined && BURNING_STATES.includes(state);

// Ruch zaworu mieszacza z bitów SensorData.
export const valveText = (opening?: boolean, closing?: boolean) =>
  opening === undefined && closing === undefined ? '---' : opening ? 'otwiera' : closing ? 'zamyka' : 'stoi';

const num = (value?: number) => value === undefined || value === null ? '' : String(value).replace('.', ',');
const yesNo = (value?: boolean) => value === undefined || value === null ? '---' : value ? 'tak' : 'nie';

// Kolumny zakładki Dane i CSV. `main` = widoczne od razu, reszta po „Pokaż wszystkie parametry”.
export type ReadingColumn = {
  key: string;
  header: string;
  csvHeader: string;
  main?: boolean;
  cell: (r: PelletBoilerReading) => string;
  csv: (r: PelletBoilerReading) => string;
};

const temp = (key: keyof PelletBoilerReading, header: string, csvHeader: string, main = false): ReadingColumn => ({
  key, header, csvHeader: `${csvHeader} [°C]`, main,
  cell: (r) => formatNumber(r[key] as number | undefined),
  csv: (r) => num(r[key] as number | undefined),
});
const flag = (key: keyof PelletBoilerReading, header: string, main = false): ReadingColumn => ({
  key, header, csvHeader: header, main,
  cell: (r) => yesNo(r[key] as boolean | undefined),
  csv: (r) => yesNo(r[key] as boolean | undefined),
});
const value = (key: keyof PelletBoilerReading, header: string, csvHeader: string, digits = 1): ReadingColumn => ({
  key, header, csvHeader,
  cell: (r) => formatNumber(r[key] as number | undefined, digits),
  csv: (r) => num(r[key] as number | undefined),
});

export const READING_COLUMNS: ReadingColumn[] = [
  { key: 'createdAt', header: 'Czas', csvHeader: 'Czas', main: true,
    cell: (r) => formatTime(r.createdAt), csv: (r) => formatDateTime(r.createdAt) },
  { key: 'state', header: 'Stan', csvHeader: 'Stan', main: true,
    cell: (r) => readingStateName(r), csv: (r) => readingStateName(r) },
  temp('heating_temp', 'Kocioł', 'Kocioł', true),
  temp('heating_target', 'Kocioł zad.', 'Kocioł zadana', true),
  temp('water_heater_temp', 'CWU', 'CWU', true),
  temp('water_heater_target', 'CWU zad.', 'CWU zadana', true),
  // przy „Pokaż wszystkie” pompa i zawór mieszacza stoją przy jego temperaturach, a pompy CO/CWU
  // i temperatura zewnętrzna za zaworem mieszacza 2
  temp('mixer1_temp', 'Miesz. 1', 'Mieszacz 1', true),
  temp('mixer1_target', 'M1 zad.', 'Mieszacz 1 zadana', true),
  flag('mixer1_pump', 'Pompa M1'),
  { key: 'mixer1_valve', header: 'Zawór M1', csvHeader: 'Zawór M1',
    cell: (r) => valveText(r.mixer1_opening, r.mixer1_closing), csv: (r) => valveText(r.mixer1_opening, r.mixer1_closing) },
  temp('mixer2_temp', 'Miesz. 2', 'Mieszacz 2', true),
  temp('mixer2_target', 'M2 zad.', 'Mieszacz 2 zadana', true),
  flag('mixer2_pump', 'Pompa M2'),
  { key: 'mixer2_valve', header: 'Zawór M2', csvHeader: 'Zawór M2',
    cell: (r) => valveText(r.mixer2_opening, r.mixer2_closing), csv: (r) => valveText(r.mixer2_opening, r.mixer2_closing) },
  flag('heating_pump', 'Pompa CO', true),
  flag('water_heater_pump', 'Pompa CWU', true),
  temp('outside_temp', 'Zewn.', 'Zewnętrzna', true),
  temp('feeder_temp', 'T podajn.', 'Temperatura podajnika'),
  temp('optical_temp', 'Optyczny', 'Czujnik optyczny'),
  temp('upper_buffer_temp', 'Bufor góra', 'Bufor góra'),
  temp('lower_buffer_temp', 'Bufor dół', 'Bufor dół'),
  value('fuel_level', 'Paliwo %', 'Paliwo [%]', 0),
  value('fan_power', 'Went. %', 'Wentylator [%]', 0),
  value('boiler_load', 'Obciąż. %', 'Obciążenie [%]', 0),
  value('boiler_power', 'Moc kW', 'Moc [kW]'),
  value('fuel_consumption', 'Zużycie kg/h', 'Zużycie paliwa [kg/h]', 2),
  value('lambda_level', 'Lambda %', 'Lambda [%]'),
  flag('fan', 'Wentylator'),
  flag('feeder', 'Podajnik'),
  flag('lighter', 'Zapalarka'),
  flag('circulation_pump', 'Cyrkulacja'),
  flag('alarm', 'Alarm'),
];

// CSV dla Excela z polskimi ustawieniami: separator ';', przecinek dziesiętny; zawsze wszystkie kolumny.
export const readingsToCsv = (readings: PelletBoilerReading[]) => {
  const header = READING_COLUMNS.map((column) => column.csvHeader);
  const rows = readings.map((r) => READING_COLUMNS.map((column) => column.csv(r)).join(';'));
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
