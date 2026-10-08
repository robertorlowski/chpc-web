// Typy pompy ciepła: telemetria, PV, operacje, harmonogramy i starsze ustawienia czasowe.
// Kontrakt z serwerem (server/src/modules/heat-pump/types.ts); nowe pole telemetrii trzeba dodać
// tutaj, w typach i schemacie serwera oraz w widokach, inaczej nie zostanie zapisane ani pokazane.

// TimeSlot i SettingsEntry: starszy model ustawień czasowych (kolekcja settings), nieużywany przez scheduler.
export type TimeSlot = {
    slot_start_hour?: number,
    slot_start_minute?: number,
    slot_stop_hour?: number,
    slot_stop_minute?: number
};

export type SettingsEntry  = {
  night_hour?: TimeSlot,
  settings?: TimeSlot[],
  cwu_settings?: TimeSlot[]
};

// Tryb sterownika co w telemetrii: M — CO, A — CO z harmonogramem, CWU, OFF; może być też 'PV'
// (tryb lokalny co). Dawne wartości properties.work_mode (do 2026-10-05).
export type WorkMode = 'M' | 'A' | 'CWU' | 'OFF';

// Tryb pracy pompy w aplikacji (properties.work_mode, GET /operation, /schedules/current):
// ręczny = ustawienia domyślne, automatyczny = harmonogram (poza wpisami ustawienia domyślne), OFF.
export type PumpWorkMode = 'MANUAL' | 'AUTO' | 'OFF';

export const PUMP_WORK_MODE_LABELS: Record<PumpWorkMode, string> = {
  MANUAL: 'Ręczny',
  AUTO: 'Automatyczny',
  OFF: 'OFF',
};

// Dawne wartości properties.work_mode czytane jak serwer (pump-mode.service.ts).
export const pumpWorkMode = (value?: string): PumpWorkMode =>
  value === 'AUTO' || value === 'A' || value === 'CWU' ? 'AUTO' : value === 'OFF' ? 'OFF' : 'MANUAL';

// Wpis harmonogramu: HEAT — praca, OFF — przerwa; CO i CWU to wpisy sprzed 2026-10-05 (działają jak praca).
export enum ScheduleType {
  HEAT = 'heat',
  CWU = 'cwu',
  CO = 'co',
  OFF = 'off',
}

// Dni harmonogramu: wspólne z włącznikiem, więc zdefiniowane w core.
import { WeekDay } from '../../core/types';
export { WeekDay };

// date ma pierwszeństwo przed dayOfWeek; brak temperatury = wartość domyślna urządzenia; bez co_pomp.
export type ScheduleEntry = {
  _id?: string;
  type: ScheduleType;
  enabled: boolean;
  dayOfWeek?: WeekDay;
  date?: string;
  startTime: string;
  endTime: string;
  forceStart: boolean;
  minTemperature?: number;
  maxTemperature?: number;
};

// GET /schedules/current: scheduleId = null oznacza, że obowiązuje ustawienie domyślne
export type CurrentSchedule = {
  scheduleId: string | null;
  work_mode: PumpWorkMode;
};

// Pole HP telemetrii: JSON z CHPC (StatsSerial) przekazany przez co bez zmian. Flagi (HPS, F, CO,
// HCS, CCS) CHPC wysyła jako 0/1: rekordy z bazy mają je jako boolean (schemat Mongo), a surowa
// telemetria z GET /hp jako liczby, dlatego widoki sprawdzają je przez truthy albo Number().
export type HpMetrics = {
    Tbe: number,
    Tae: number,
    Tco: number,
    Tho: number,
    Ttarget: number,
    Tsump: number,
    EEV_dt: number,
    Tcwu: number,
    Tmax: number,
    Tmin: number,
    Tcwu_max: number,
    Tcwu_min: number,
    Watts: number,
    EEV: number,
    EEV_pos: number,
    HCS: boolean,
    CCS: boolean,
    HPS: boolean,
    F: boolean,
    CWUS: boolean,
    CWU: boolean,
    CO: boolean,
    SHS: boolean,
    WWatt: number,
    EEVmax: number,
    EEVmin?: number,
    ERR?: number,
    ERRn?: number,
    ERRc?: number,
    lt_pow: number,
    lt_hp_on: number

  }

export type PvMetrics = {
  total_power: number,
  total_prod: number,
  total_prod_today: number,
  temperature: number
}

// Port mikrofalownika z odczytu DTU (GET /pv, /pv/range).
export type PvPanel = {
  serial: string,
  port: number,
  power: number,
  prod_today: number,
  prod_total: number,
  temperature: number,
  pv_voltage: number,
  pv_current: number,
  grid_voltage: number,
  grid_frequency: number,
  status: number,
  alarm_code: number,
  alarm_count: number,
  link: number
}

// panels znika z odczytów starszych niż 90 dni, podsumowanie zostaje.
export type PvEntry = PvMetrics & {
  time: string,
  pv_power: boolean,
  panels?: PvPanel[],
  createdAt: string
}

// Rekord telemetrii (GET /hp, /hp/4day, /hp/all). time z co: "YYYY.MM.DD HH:MM:SS" (czas polski).
// PV: w rekordach z bazy samo total_power wpisane przez serwer, w GET /hp pełne podsumowanie.
// t_out: temperatura zewnętrzna (czujnik kotła) dopisana przez serwer.
export type HpEntry = {
  HP: HpMetrics,
  PV: PvMetrics,
  time: string,
  /** czas zapisu odczytu na serwerze (ISO); ekran Home liczy z niego wiek danych („Dane nieaktualne”) */
  createdAt?: string,
  co_pomp: boolean,
  cwu_pomp?: boolean,
  pv_power: boolean,
  schedule_on: boolean,
  work_mode: string,
  co_min: string,
  co_max: string,
  cwu_min: string,
  cwu_max: string,
  t_min: number,
  t_max: number,
  cop:number,
  t_out: number,
  error_code?: number
}

// Operacja dla sterownika co: wszystkie wartości są napisami ("0"/"1", "45"). error_reset i restart
// to akcje jednorazowe (POST /operation/action), a nie pola operacji ręcznej. Formularz Ustawień
// (GET /operation, POST /operation/set) używa work_mode aplikacji (MANUAL, AUTO, OFF) i temp_min/temp_max.
export type OperationEntry = {
  force?: string,
  work_mode?: string,
  temp_min?: string,
  temp_max?: string,
  co_pomp?: string,
  sump_heater?: string,
  cold_pomp?: string,
  hot_pomp?: string,
  co_min?: string,
  co_max?: string,
  cwu_min?: string,
  cwu_max?: string,
  working_watt?: string,
  eev_max_pulse_open?: string,
  eev_min_pulse_open?: string,
  error_reset?: string,
  restart?: string,
  eev_setpoint?: string
}

// Wiersz tabeli Dane i próbka Wykresu: spłaszczone HP + czas, tryb, moc PV (pv = PV.total_power) i błąd.
export type THPL = HpMetrics & {
  time :string,
  work_mode?: string,
  pv :number,
  error_code?: number
};

/** Ładowanie CWU w kotle zasilanym przez pompę (GET /hp/cwu-loading); pompa grzeje wtedy 47–49 °C. */
export type HpCwuLoading = {
  active: boolean;
  since: string | null;
  /** pompa w trybie OFF: ładowanie trwa, ale pompa nie dogrzewa wody */
  pumpOff: boolean;
};
