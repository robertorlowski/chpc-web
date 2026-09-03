import mongoose, { Schema, model, InferSchemaType, Model, Document } from 'mongoose';
import { Device, DeviceType, HpEntry, HpMetrics, PvMetrics, ScheduleEntry, ScheduleType, SettingsEntry, timePattern, TimeSlot, WeekDay } from '../middleware/type';


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

const HpEntrySchema = new Schema<HpEntry>(
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
    t_out: {type: Number}
  },
  { timestamps: true, _id: true, collection: 'hp' }
);

const SettingsEntrySchema = new Schema<SettingsEntry>(
  {
    night_hour: { type: TimeSlotSchema },
    settings: { type: [TimeSlotSchema] },
    cwu_settings: { type: [TimeSlotSchema] },
  },
  { timestamps: true, _id: true, collection: 'settings' }
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

    deviceEnabled: {
      type: Boolean,
      required: true,
    },

    minTemperature: {
      type: Number,
      required: true,
    },

    maxTemperature: {
      type: Number,
      required: true,
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
    name: {
      type: String,
      required: true,
      trim: true,
    },
    hp: { type: [HpEntrySchema] },
    settings: { type: SettingsEntrySchema },
    schedules: { type: [ScheduleEntrySchema] },
  },
  { timestamps: true, collection: 'devices' }
);



export type HpEntryDoc = InferSchemaType<typeof HpEntrySchema>;
export const HpEntryModel = model<HpEntryDoc>('HpEntry', HpEntrySchema);

export type SettingsEntryDoc = InferSchemaType<typeof SettingsEntrySchema>;
export const SettingsEntryModel = model<SettingsEntryDoc>('SettingsEntry', SettingsEntrySchema);

// export type ScheduleEntryDoc = InferSchemaType<typeof ScheduleEntrySchema>;
// export const ScheduleEntryModel = model<ScheduleEntryDoc>('ScheduleEntry', ScheduleEntrySchema);

export const DeviceModel: Model<DeviceDocument> =
  mongoose.models.Root ||
  mongoose.model<DeviceDocument>('Root', DeviceSchema);