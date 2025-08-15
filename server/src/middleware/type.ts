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
    lt_pow?: number,
    lt_hp_on?: number
  }

export interface PvMetrics {
  total_power?: number,
  total_prod?: number,
  total_prod_today?: number,
  temperature?: number
}

export interface HpEntry {
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
  cop?:number
}

export interface TimeSlot {
    slot_start_hour?: Number,
    slot_start_minute?: Number,
    slot_stop_hour?: Number,
    slot_stop_minute?: Number
};

export interface SettingsEntry {
  night_hour?: TimeSlot,
  settings?: TimeSlot[],
  cwu_settings?: TimeSlot[]
};

export interface OperationEntry {
  force?: String,
  work_mode?: String,
  sump_heater?: String,
  cold_pomp?: String,
  hot_pomp?: String,
  co_min?: String,
  co_max?: String,
  cwu_min?: String,
  cwu_max?: String,
  working_watt?: String,
  eev_max_pulse_open?: String,
  eev_setpoint?: String
}

export interface Root {
  hp: HpEntry[];
  settings: SettingsEntry;
}