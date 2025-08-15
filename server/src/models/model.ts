import mongoose, { Schema, model, InferSchemaType } from 'mongoose';

const TimeSlotSchema = new Schema(
  {
    slot_start_hour: { type: Number },
    slot_start_minute: { type: Number },
    slot_stop_hour: { type: Number },
    slot_stop_minute: { type: Number },
  },
  { _id: false }
);

const HpMetricsSchema = new Schema(
  {
    Tbe: { type: Number },
    Tae: { type: Number },
    Tco: { type: Number },
    Tho: { type: Number },
    Ttarget: { type: Number },
    Tsump: { type: Number },
    EEV_dt: { type: Number },
    Tcwu: { type: Number },
    Tmax: { type: Number },
    Tmin: { type: Number },
    Tcwu_max: { type: Number },
    Tcwu_min: { type: Number },
    Watts: { type: Number },
    EEV: { type: Number },
    EEV_pos: { type: Number },
    HCS: { type: Boolean },
    CCS: { type: Boolean },
    HPS: { type: Boolean },
    F: { type: Boolean },
    CWUS: { type: Boolean },
    CWU: { type: Boolean },
    CO: { type: Boolean },
    SHS: { type: Boolean },
    WWatt: { type: Number },
    EEVmax: { type: Number },
    lt_pow: { type: Number },
    lt_hp_on: { type: Number },
  },
  { _id: false }
);

const PvMetricsSchema = new Schema(
  {
    total_power: { type: Number },
    total_prod: { type: Number },
    total_prod_today: { type: Number },
    temperature: { type: Number },
  },
  { _id: false }
);

const HpEntrySchema = new Schema(
  {
    HP: { type: HpMetricsSchema },
    PV: { type: PvMetricsSchema },
    time: { type: String },
    co_pomp: { type: Boolean },
    cwu_pomp: { type: Boolean },
    pv_power: { type: Boolean },
    schedule_on: { type: Boolean },
    work_mode: { type: String },
    co_min: { type: String },
    co_max: { type: String },
    cwu_min: { type: String },
    cwu_max: { type: String },
    t_min: { type: Number },
    t_max: { type: Number },
    cop: { type: Number },
  },
  { timestamps: true, collection: 'hpentrys' }
);

const SettingsEntrySchema = new Schema(
  {
    night_hour: { type: TimeSlotSchema },
    settings: { type: [TimeSlotSchema] },
    cwu_settings: { type: [TimeSlotSchema] },
  },
  { timestamps: true, collection: 'settingsentrys' }
);

const OperationEntrySchema = new Schema(
  {
    force: { type: String },
    work_mode: { type: String },
    sump_heater: { type: String },
    cold_pomp: { type: String },
    hot_pomp: { type: String },
    co_min: { type: String },
    co_max: { type: String },
    cwu_min: { type: String },
    cwu_max: { type: String },
    working_watt: { type: String },
    eev_max_pulse_open: { type: String },
    eev_setpoint: { type: String },
  },
  { timestamps: true, collection: 'operationentrys' }
);

const RootSchema = new Schema(
  {
    hp: { type: [HpEntrySchema] },
    settings: { type: SettingsEntrySchema },
  },
  { timestamps: true, collection: 'roots' }
);

export type HpEntryDoc = InferSchemaType<typeof HpEntrySchema>;
export const HpEntryModel = model<HpEntryDoc>('HpEntry', HpEntrySchema);

export type SettingsEntryDoc = InferSchemaType<typeof SettingsEntrySchema>;
export const SettingsEntryModel = model<SettingsEntryDoc>('SettingsEntry', SettingsEntrySchema);

export type     OperationEntryDoc = InferSchemaType<typeof OperationEntrySchema>;
export const OperationEntryModel = model<OperationEntryDoc>('OperationEntry', OperationEntrySchema);
