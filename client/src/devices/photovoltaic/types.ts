// Typy fotowoltaiki (DTU Hoymiles czytane przez sterownik co): kontrakt z modułem serwera
// photovoltaic (GET /api/photovoltaic/*). Moc w W, energia w Wh.

export type PvPanelState = 'produces' | 'idle' | 'offline' | 'alarm';

export type PvPanel = {
  /** serial-port */
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
  state: PvPanelState;
};

export type PvCurrent = {
  readAt?: string;
  stale: boolean;
  power?: number;
  todayWh?: number;
  totalWh?: number;
  monthWh?: number;
  monthFrom?: string;
  temperature?: number;
  panels: PvPanel[];
  panelsAvailable: boolean;
};

export type PvDay = {
  date: string;
  points: { t: string; power: number; temperature?: number; todayWh?: number }[];
  panels: { key: string; serial: string; port: number; energyWh?: number; points: { t: string; power: number }[] }[];
  energyWh?: number;
  peakW?: number;
  peakAt?: string;
};

export type PvSummaryPeriod = 'month' | 'year' | 'total';

export type PvSummary = {
  period: PvSummaryPeriod;
  date: string;
  buckets: { key: string; energyWh: number; peakW?: number; days: number }[];
  energyWh: number;
};

export type PvReadingRow = {
  t: string;
  power?: number;
  todayWh?: number;
  totalWh?: number;
  temperature?: number;
} & Partial<PvPanel>;

export type PvInverters = {
  readAt?: string;
  inverters: {
    serial: string;
    model?: string;
    prodTotalWh: number;
    grid_voltage?: number;
    grid_frequency?: number;
    temperature?: number;
    ports: { port: number; prodTotalWh?: number; status?: number; link?: number; alarm_code?: number; alarm_count?: number; state: PvPanelState }[];
  }[];
};
