import mongoose, { Schema, model, InferSchemaType, Model, Document } from 'mongoose';
import { Device, DeviceProperties, DeviceType, HpEntry, HpMetrics, PvEntry, PvMetrics, PvPanel, ScheduleEntry, ScheduleType, SettingsEntry, timePattern, TimeSlot, WeekDay } from '../middleware/type';


const TimeSlotSchema = new Schema<TimeSlot>(
  {
    slot_start_hour: { type: Number },
    slot_start_minute: { type: Number },
    slot_stop_hour: { type: Number },
    slot_stop_minute: { type: Number },
  },
  { _id: false }
);

const HpMetricsSchema = new Schema<HpMetrics>(
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
    EEVmin: { type: Number },
    ERR: { type: Number },
    ERRn: { type: Number },
    ERRc: { type: Number },
    lt_pow: { type: Number },
    lt_hp_on: { type: Number },
  },
  { _id: false }
);

const PvMetricsSchema = new Schema<PvMetrics>(
  {
    total_power: { type: Number },
    total_prod: { type: Number },
    total_prod_today: { type: Number },
    temperature: { type: Number },
  },
  { _id: false }
);

const PvPanelSchema = new Schema<PvPanel>(
  {
    serial: { type: String },
    port: { type: Number },
    power: { type: Number },
    prod_today: { type: Number },
    prod_total: { type: Number },
    temperature: { type: Number },
    pv_voltage: { type: Number },
    pv_current: { type: Number },
    grid_voltage: { type: Number },
    grid_frequency: { type: Number },
    status: { type: Number },
    alarm_code: { type: Number },
    alarm_count: { type: Number },
    link: { type: Number },
  },
  { _id: false }
);

// Odczyty PV są osobno od telemetrii HP. Rekord hp dostaje przy zapisie
// tylko PV.total_power, potrzebne do bilansu energii (addHp).
const PvEntrySchema = new Schema<PvEntry>(
  {
    rootId: { type: String, required: true },
    deviceType: { type: String, enum: Object.values(DeviceType), required: true },
    deviceId: { type: String, required: true },
    time: { type: String },
    total_power: { type: Number },
    total_prod: { type: Number },
    total_prod_today: { type: Number },
    temperature: { type: Number },
    pv_power: { type: Boolean },
    panels: { type: [PvPanelSchema], default: undefined },
  },
  { timestamps: true, _id: true, collection: 'pv' }
);
PvEntrySchema.index({ rootId: 1, createdAt: -1 });
// czyszczenie szczegółów paneli filtruje po samym createdAt
PvEntrySchema.index({ createdAt: 1 });

const HpEntrySchema = new Schema<HpEntry>(
  {
    rootId: { type: String, required: true, index: true },
    deviceType: { type: String, enum: Object.values(DeviceType), required: true },
    deviceId: { type: String, required: true, index: true },
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
    t_out: {type: Number},
    // kod błędu CHPC, gdy w tym odczycie pojawiło się nowe zdarzenie (HP.ERRn się zmienił)
    error_code: { type: Number }
  },
  { timestamps: true, _id: true, collection: 'hp' }
);

const SettingsEntrySchema = new Schema<SettingsEntry>(
  {
    rootId: { type: String, required: true, index: true },
    night_hour: { type: TimeSlotSchema },
    settings: { type: [TimeSlotSchema] },
    cwu_settings: { type: [TimeSlotSchema] },
  },
  { timestamps: true, _id: true, collection: 'settings' }
);

const DevicePropertiesSchema = new Schema<DeviceProperties>(
  {
    co_min: { type: String },
    co_max: { type: String },
    cwu_min: { type: String },
    cwu_max: { type: String },
    work_mode: {
      type: String,
      enum: ['M', 'A', 'CWU', 'OFF'],
      default: 'CWU',
    },
  },
  { _id: false }
);


const ScheduleEntrySchema = new Schema<ScheduleEntry>(
  {
    dayOfWeek: {
      type: Number,
      enum: Object.values(WeekDay).filter(
        (value) => typeof value === 'number',
      )
    },

    date: { 
      type: Date,
      required: false,
    },

    startTime: {
      type: String,
      required: true,
      match: timePattern,
    },

    endTime: {
      type: String,
      required: true,
      match: timePattern,
    },

    type: {
      type: String,
      enum: Object.values(ScheduleType),
      required: true,
    },

    enabled: {
      type: Boolean,
      default: true,
      required: true,
    },

    forceStart: {
      type: Boolean,
      default: false,
      required: true,
    },

    minTemperature: {
      type: Number,
    },

    maxTemperature: {
      type: Number,
    }
  },
  {
    timestamps: true,
    _id: true,
    collection: 'schedules'
  },
);

export interface DeviceDocument extends Device, Document {
  createdAt: Date;
  updatedAt: Date;
}

const DeviceSchema = new Schema<DeviceDocument>(
  {
    deviceType: {
      type: String,
      enum: Object.values(DeviceType),
      required: true,
    },
    deviceId: {
      type: String,
      required: true,
      trim: true,
    },
    // nazwa nadawana przez użytkownika; sterownik zarejestrowany automatycznie jej nie ma
    name: {
      type: String,
      default: '',
      trim: true,
    },
    settings: { type: SettingsEntrySchema },
    schedules: { type: [ScheduleEntrySchema] },
    properties: { type: DevicePropertiesSchema },
  },
  { timestamps: true, collection: 'devices' }
);



export type HpEntryDoc = InferSchemaType<typeof HpEntrySchema>;
export const HpEntryModel = model<HpEntryDoc>('HpEntry', HpEntrySchema);

export type PvEntryDoc = InferSchemaType<typeof PvEntrySchema>;
export const PvEntryModel = model<PvEntryDoc>('PvEntry', PvEntrySchema);

// To do usunięcia po nadpisaniu programu na ESP32
export type SettingsEntryDoc = InferSchemaType<typeof SettingsEntrySchema>;
export const SettingsEntryModel = model<SettingsEntryDoc>('SettingsEntry', SettingsEntrySchema);

// export type ScheduleEntryDoc = InferSchemaType<typeof ScheduleEntrySchema>;
// export const ScheduleEntryModel = model<ScheduleEntryDoc>('ScheduleEntry', ScheduleEntrySchema);

export const DeviceModel: Model<DeviceDocument> =
  mongoose.models.Root ||
  mongoose.model<DeviceDocument>('Root', DeviceSchema);
