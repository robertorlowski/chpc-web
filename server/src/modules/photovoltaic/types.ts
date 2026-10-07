// Typy modułu fotowoltaiki (rodzaj sterownika „photovoltaic”): widoki dla klienta liczone z odczytów
// DTU Hoymiles, które wysyła sterownik co (kolekcja pv; starsza historia — podsumowanie PV w
// rekordach hp). Moduł niczego nie zapisuje.

/** Jeden port mikrofalownika (panel) z ostatniego odczytu. */
export interface PvPanel {
  /** serial-port, np. „116400000002-3” */
  key: string;
  serial: string;
  port: number;
  power?: number;
  prod_today?: number;
  prod_total?: number;
  temperature?: number;
  pv_voltage?: number;
  pv_current?: number;
  grid_voltage?: number;
  grid_frequency?: number;
  status?: number;
  alarm_code?: number;
  alarm_count?: number;
  link?: number;
  /** produces — daje moc; idle — bez mocy, łącze w porządku (noc); offline — brak łącza z DTU; alarm — kod alarmu */
  state: 'produces' | 'idle' | 'offline' | 'alarm';
}

export interface PvCurrentView {
  /** czas ostatniego odczytu (createdAt) */
  readAt?: string;
  /** odczyt starszy niż 5 min — moc i stany paneli nieaktualne */
  stale: boolean;
  power?: number;
  todayWh?: number;
  totalWh?: number;
  yearWh?: number;
  /** od kiedy liczona produkcja roczna (pierwszy odczyt w roku; dane od 2026-05-08) */
  yearFrom?: string;
  temperature?: number;
  panels: PvPanel[];
  /** czy są szczegóły paneli (od 2026-09-26) */
  panelsAvailable: boolean;
}

export interface PvDayPoint {
  /** początek przedziału 5 min (ISO) */
  t: string;
  /** średnia moc w przedziale [W] */
  power: number;
  temperature?: number;
  /** produkcja od północy na koniec przedziału [Wh] */
  todayWh?: number;
}

export interface PvDayView {
  date: string;
  points: PvDayPoint[];
  /** moc paneli w przedziałach 5 min, gdy są szczegóły */
  panels: { key: string; serial: string; port: number; energyWh?: number; points: { t: string; power: number }[] }[];
  energyWh?: number;
  peakW?: number;
  peakAt?: string;
}

export interface PvSummaryBucket {
  /** YYYY-MM-DD, YYYY-MM albo YYYY */
  key: string;
  energyWh: number;
  peakW?: number;
  days: number;
}

export interface PvSummaryView {
  period: 'month' | 'year' | 'total';
  date: string;
  buckets: PvSummaryBucket[];
  energyWh: number;
}
