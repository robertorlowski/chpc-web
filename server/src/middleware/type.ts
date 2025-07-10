export type TSlot = {
    slot_start_hour?: Number,
    slot_start_minute?: Number,
    slot_stop_hour?: Number,
    slot_stop_minute?: Number
};

export type TSettings  = {
  night_hour?: TSlot,
  settings?: TSlot[],
  cwu_settings?: TSlot[]
};

export type THP = {
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
    Working_Watt?: number,
    EEV_max_pulse_open?: number,
    last_power?: number,
    last_heatpump_on?: number
  }

export type TPV = {
  total_power?: number,
  total_prod?: number,
  total_prod_today?: number,
  temperature?: number
}

export type TCO = {
  HP?: THP,
  PV?: TPV,
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

export type TOperationCO = {
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
  eev_max_pulse_open?: String
}