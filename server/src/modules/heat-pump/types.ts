import type { DeviceType } from '../../core/types';

// Typy pompy ciepła: telemetria (hp), PV z DTU (pv), operacje dla sterownika co,
// harmonogramy i starsze ustawienia czasowe (settings).

// HH:mm dla startTime/endTime harmonogramu
export const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

// Tryb pracy pompy (properties.work_mode i operacja): M — ręczny CO (po północy
// wraca na A), A — CO z harmonogramem, CWU — CWU z harmonogramem, OFF — wyłączona.
// Sterownik co przyjmuje też PV, którego serwer nie wysyła.
export type WorkMode = 'M' | 'A' | 'CWU' | 'OFF';

export enum ScheduleType {
  CWU = 'cwu',
  CO = 'co',
  OFF = 'off',
}

// Dni harmonogramu: wspólne z włącznikiem, więc zdefiniowane w core.
import { WeekDay } from '../../core/types';
export { WeekDay };

export interface ScheduleEntry {
  /** Jednoznaczny identyfikator slotu harmonogramu. */
  _id?: string;
  type: ScheduleType;

  /**
   * Czy wpis harmonogramu jest aktywny.
   */
  enabled: boolean;

  /**
   * Wpis harmonogramu może dotyczyć:
   * - konkretnego dnia tygodnia,
   * - konkretnej daty.
   *
   * W przypadku ustawienia konkretnej daty pole date
   * ma pierwszeństwo przed dayOfWeek.
   */
  dayOfWeek?: WeekDay;
  date?: Date;

  /**
   * Godziny w formacie HH:mm.
   */
  startTime: string;
  endTime: string;

  /**
   * Wymuszenie startu sprężarki (force = "1") przez cały czas trwania wpisu.
   * Dla przerwy OFF ignorowane.
   */
  forceStart: boolean;

  /**
   * Temperatury min/max dla CO albo CWU (zależnie od type). Brak = wartość
   * domyślna urządzenia. Harmonogram nie ma co_pomp: stan pompy CO ustala sterownik.
   */

  minTemperature?: number;
  maxTemperature?: number;
}

// Pole HP telemetrii: JSON z CHPC (StatsSerial) przekazany przez co bez zmian.
// Tylko te klucze są zapisywane (schemat ścisły w models/hp.model.ts); np. FW,
// EEV_pulse przepadają. ERR — kod ostatniego zdarzenia (nie wraca do 0), ERRn —
// numer zdarzenia, ERRc — licznik błędów (5 = blokada). lt_pow w Wh, lt_hp_on w s.
export interface HpMetrics {
    Tbe?: number,
    Tae?: number,
    Tco?: number,
    Tho?: number,
    Ttarget?: number,
    Tsump?: number,
    EEV_dt?: number,
    Tcwu?: number,
    Tmax?: number,
    Tmin?: number,
    Tcwu_max?: number,
    Tcwu_min?: number,
    Watts?: number,
    EEV?: number,
    EEV_pos?: number,
    HCS?: boolean,
    CCS?: boolean,
    HPS?: boolean,
    F?: boolean,
    CWUS?: boolean,
    CWU?: boolean,
    CO?: boolean,
    SHS?: boolean,
    WWatt?: number,
    EEVmax?: number,
    EEVmin?: number,
    ERR?: number,
    ERRn?: number,
    ERRc?: number,
    lt_pow?: number,
    lt_hp_on?: number
  }

// Podsumowanie PV: moc [W], produkcja [Wh], temperatura [°C] (najniższa z portów).
export interface PvMetrics {
  total_power?: number,
  total_prod?: number,
  total_prod_today?: number,
  temperature?: number
}

// Jeden port mikrofalownika Hoymiles, tak jak podaje go DTU.
export interface PvPanel {
  serial?: string,
  port?: number,
  power?: number,
  prod_today?: number,
  prod_total?: number,
  temperature?: number,
  pv_voltage?: number,
  pv_current?: number,
  grid_voltage?: number,
  grid_frequency?: number,
  status?: number,
  alarm_code?: number,
  alarm_count?: number,
  link?: number
}

// Odczyt PV z POST /pv/add: podsumowanie instalacji i szczegóły portów.
// panels jest usuwane po PANEL_DETAILS_RETENTION_DAYS, podsumowanie zostaje.
export interface PvEntry extends PvMetrics {
  rootId?: string;
  deviceType?: DeviceType;
  deviceId?: string;
  time?: string,
  pv_power?: boolean,
  panels?: PvPanel[],
  createdAt?: Date
}

// Telemetria z POST /hp/add (kolekcja hp). rootId, deviceType, deviceId, t_out
// i error_code dopisuje serwer; PV to tylko total_power z ostatniego odczytu pv
// (starsze rekordy mają pełne PV od sterownika). time: "YYYY.MM.DD HH:MM:SS" (czas polski).
export interface HpEntry {
  rootId?: string;
  deviceType?: DeviceType;
  deviceId?: string;
  HP?: HpMetrics | null,
  PV?: PvMetrics,
  time?: String,
  co_pomp?: boolean,
  cwu_pomp?: Boolean,
  pv_power?: boolean,
  schedule_on?: boolean,
  work_mode?: String,
  co_min?: String,
  co_max?: String,
  cwu_min?: String,
  cwu_max?: String,
  t_min?: number,
  t_max?: number,
  cop?: number,
  t_out? :number,
  error_code?: number
}

// Starszy model ustawień czasowych (kolekcja settings), niezależny od harmonogramów.
export interface TimeSlot {
    slot_start_hour?: Number,
    slot_start_minute?: Number,
    slot_stop_hour?: Number,
    slot_stop_minute?: Number,
    work_mode?: String,
    min_temp?: number;
    max_temp?: number;
    force?: String;
};

export interface SettingsEntry {
  rootId?: string;
  night_hour?: TimeSlot,
  settings?: TimeSlot[],
  cwu_settings?: TimeSlot[]
};

// Operacja dla sterownika co (pole operation w odpowiedzi /hp/add). Wszystkie
// wartości to napisy ("0"/"1", "45"). co zamienia zmienione wartości na komendy
// RS-485 do CHPC i pamięta ostatnią przysłaną: brak klucza nie przywraca domyślnej.
// error_reset i restart to akcje jednorazowe (takeOperationActions).
export interface OperationEntry {
  force?: String,
  work_mode?: String,
  co_pomp?: String,
  sump_heater?: String,
  cold_pomp?: String,
  hot_pomp?: String,
  co_min?: String,
  co_max?: String,
  cwu_min?: String,
  cwu_max?: String,
  working_watt?: String,
  eev_max_pulse_open?: String,
  eev_min_pulse_open?: String,
  error_reset?: String,
  restart?: String,
  eev_setpoint?: String
}
