import mongoose, { Schema, Model, Document } from 'mongoose';
import { Device, DeviceProperties, DeviceType } from './device.types';
import { ScheduleEntrySchema, SettingsEntrySchema } from '../../modules/heat-pump/models';
import { WaterTankSchema } from '../../modules/water-pressure/models';

// Ustawienia wszystkich rodzajów sterowników w jednym polu properties.
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
    // hydrofor
    compressor_seconds: { type: Number, min: 1, max: 3600 },
    pressure_low: { type: Number, min: 0 },
    pressure_high: { type: Number, min: 0 },
    tanks: { type: [WaterTankSchema], default: undefined },
  },
  { _id: false }
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
    isDefault: { type: Boolean, default: false },
    // pompa ciepła
    settings: { type: SettingsEntrySchema },
    schedules: { type: [ScheduleEntrySchema] },
    properties: { type: DevicePropertiesSchema },
  },
  { timestamps: true, collection: 'devices' }
);

export const DeviceModel: Model<DeviceDocument> =
  mongoose.models.Root ||
  mongoose.model<DeviceDocument>('Root', DeviceSchema);
