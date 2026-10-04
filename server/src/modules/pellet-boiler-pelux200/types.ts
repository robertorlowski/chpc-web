import type { DeviceType } from '../../core/types';

// Typy kotła pelletowego Plum Pellux 200 (regulator ecoMAX): odczyt wysyłany
// przez sterownik co (kolekcja pellet_boiler_pelux200). Wszystkie pola pomiarowe
// są opcjonalne: sterownik wysyła to, co udało się odczytać.

export interface PelletBoilerPelux200Measurements {
  /** stan kotła 0..11: OFF, STABILIZATION, KINDLING, WORKING, SUPERVISION, PAUSED, STANDBY, BURNING_OFF, ALERT, MANUAL, UNSEALING, OTHER */
  state?: number;
  // temperatury [°C]
  heating_temp?: number;
  feeder_temp?: number;
  water_heater_temp?: number;
  outside_temp?: number;
  return_temp?: number;
  exhaust_temp?: number;
  optical_temp?: number;
  upper_buffer_temp?: number;
  lower_buffer_temp?: number;
  heating_target?: number;
  water_heater_target?: number;
  heating_status?: number;
  water_heater_status?: number;
  /** poziom paliwa [%] */
  fuel_level?: number;
  /** moc dmuchawy [%] */
  fan_power?: number;
  /** obciążenie kotła [%] */
  boiler_load?: number;
  /** moc kotła [kW] */
  boiler_power?: number;
  /** zużycie paliwa [kg/h] */
  fuel_consumption?: number;
  /** poziom tlenu w spalinach (lambda) [%] */
  lambda_level?: number;
  // wyjścia
  fan?: boolean;
  feeder?: boolean;
  heating_pump?: boolean;
  water_heater_pump?: boolean;
  circulation_pump?: boolean;
  lighter?: boolean;
  alarm?: boolean;
  // mieszacze 1 (grzejniki) i 2 od firmware 1.2.0; brak pól = mieszacz niepodłączony
  /** temperatura obiegu mieszacza [°C] */
  mixer1_temp?: number;
  /** zadana mieszacza [°C] */
  mixer1_target?: number;
  mixer1_pump?: boolean;
  /** siłownik zaworu otwiera */
  mixer1_opening?: boolean;
  /** siłownik zaworu zamyka */
  mixer1_closing?: boolean;
  mixer2_temp?: number;
  mixer2_target?: number;
  mixer2_pump?: boolean;
  mixer2_opening?: boolean;
  mixer2_closing?: boolean;
}

/** Ustawienia regulatora ze sterownika: surowe dane odpowiedzi (hex), jak /boiler-settings.json. */
export interface PelletBoilerSettingsRaw {
  /** odpowiedź 0xB1: [0, pierwszy nr, liczba] + liczba × (wartość, min, max) */
  ecomax_parameters?: string;
  /** odpowiedź 0xB2: [0, pierwszy nr, liczba, mieszacze] + mieszacze × liczba × 3 */
  mixer_parameters?: string;
  thermostat_parameters?: string;
  schedules?: string;
  regulator_data_schema?: string;
}

/** Parametr po rozkodowaniu (wartość, min i max w jednostkach, raw = bajty z ramki). */
export interface PelletBoilerParameter {
  index: number;
  name: string | null;
  label?: string;
  description?: string;
  /** ocena zmiany z docs/parametry-kotla.md */
  rating?: string;
  unit?: string;
  kind?: 'switch';
  /** wartość = (surowa − offset) × step (brak = 1 i 0) */
  step?: number;
  offset?: number;
  value: number;
  min: number;
  max: number;
  raw: [number, number, number];
}

export interface PelletBoilerSettingsView {
  readAt: Date;
  deviceId?: string;
  groups: { key: string; label: string; parameters: PelletBoilerParameter[] }[];
  mixers: { mixer: number; parameters: PelletBoilerParameter[] }[];
}

/** Zmiana parametru z aplikacji: parametr kotła (0x33) albo mieszacza (0x34), wartość surowa. */
export interface PelletBoilerCommandChange {
  kind: 'ecomax' | 'mixer';
  /** numer mieszacza od 1 (kind = mixer) */
  mixer?: number;
  index: number;
  value: number;
}

export type PelletBoilerCommandStatus = 'pending' | 'sent' | 'done' | 'error' | 'replaced';

export interface PelletBoilerCommandEntry extends PelletBoilerCommandChange {
  _id?: unknown;
  rootId: string;
  previous?: number;
  label?: string;
  status: PelletBoilerCommandStatus;
  error?: string;
  sentAt?: Date;
  doneAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PelletBoilerPelux200Entry extends PelletBoilerPelux200Measurements {
  rootId: string;
  deviceType?: DeviceType;
  deviceId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
