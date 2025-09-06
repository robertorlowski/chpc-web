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
    lt_pow: number,
    lt_hp_on: number

  }

export type PvMetrics = {
  total_power: number,
  total_prod: number,
  total_prod_today: number,
  temperature: number
}

export type HpEntry = {
  HP: HpMetrics,
  PV: PvMetrics,
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
  cop:number,
  t_out: number
}

export type OperationEntry = {
  force?: string,
  work_mode?: string,
  sump_heater?: string,
  cold_pomp?: string,
  hot_pomp?: string,
  co_min?: string,
  co_max?: string,
  cwu_min?: string,
  cwu_max?: string,
  working_watt?: string,
  eev_max_pulse_open?: string,
  eev_setpoint?: string
}

export type THPL = HpMetrics & {
  time :string,
  pv :number
};
