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

export enum DeviceType {
  HP = 'heat_pump',
}

export type WorkMode = 'M' | 'A' | 'CWU' | 'OFF';

export type DeviceProperties = {
  co_min?: string;
  co_max?: string;
  cwu_min?: string;
  cwu_max?: string;
  work_mode?: WorkMode;
};

export type Device = {
  rootId: string;
  deviceType: DeviceType;
  deviceId: string;
  name: string;
  properties?: DeviceProperties;
};

export enum ScheduleType {
  CWU = 'cwu',
  CO = 'co',
  OFF = 'off',
}

export enum WeekDay {
  ANY_DAY = -1,
  WORKDAYS = -2,
  DAYS_OFF = -3,
  SUNDAY = 0,
  MONDAY = 1,
  TUESDAY = 2,
  WEDNESDAY = 3,
  THURSDAY = 4,
  FRIDAY = 5,
  SATURDAY = 6,
}

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
  work_mode: string;
};

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

export type HpEntry = {
  HP: HpMetrics,
  PV: PvMetrics,
  time: string,
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

export type OperationEntry = {
  force?: string,
  work_mode?: string,
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

export type THPL = HpMetrics & {
  time :string,
  work_mode?: string,
  pv :number,
  error_code?: number
};
