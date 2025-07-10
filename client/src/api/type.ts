export type TSlot = {
    slot_start_hour?: number,
    slot_start_minute?: number,
    slot_stop_hour?: number,
    slot_stop_minute?: number
};

export type TSettings  = {
  night_hour?: TSlot,
  settings?: TSlot[],
  cwu_settings?: TSlot[]
};

export type THP = {
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
    lt_pow: number,
    lt_hp_on: number

  }

export type TPV = {
  total_power: number,
  total_prod: number,
  total_prod_today: number,
  temperature: number
}

export type TCO = {
  HP: THP,
  PV: TPV,
  time: string,
  co_pomp: boolean,
  cwu_pomp: Boolean,
  pv_power: boolean,
  schedule_on: boolean,
  work_mode: string,
  co_min: string,
  co_max: string,
  cwu_min: string,
  cwu_max: string,
  t_min: number,
  t_max: number,
  cop:number
}

export type TOperationCO = {
  force?: string,
  work_mode?: string,
  sump_heater?: string,
  cold_pomp?: string,
  hot_pomp?: string,
  co_min?: string,
  co_max?: string,
  cwu_min?: string,
  cwu_max?: string,
  working_watt?: String,
  eev_max_pulse_open?: String
}