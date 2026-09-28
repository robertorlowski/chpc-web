import { Schema, model } from 'mongoose';
import { DeviceType } from '../../core/devices/device.types';
import { WaterMeterReading, WaterPressureRun, WaterTank } from './types';

// Zbiornik w ustawieniach urządzenia (properties.tanks).
export const WaterTankSchema = new Schema<WaterTank>(
  {
    name: { type: String, default: '', trim: true },
    kind: { type: String, enum: ['air', 'membrane'], required: true },
    volumeLiters: { type: Number, required: true, min: 0 },
    enabled: { type: Boolean, default: true },
    precharge: { type: Number, min: 0 },
    k: { type: Number, min: 0 },
  },
  { _id: false }
);

// Uruchomienia pompy hydroforu: jeden dokument na runId, aktualizowany co 1 s
// przez sterownik (POST /water-pressure/add).
const WaterPressureRunSchema = new Schema<WaterPressureRun>(
  {
    rootId: { type: String, required: true },
    deviceType: { type: String, enum: Object.values(DeviceType), required: true },
    deviceId: { type: String, required: true },
    runId: { type: Number, required: true },
    pumpStart: { type: Date, required: true },
    pumpEnd: { type: Date, required: true },
    compressorStart: { type: Date },
    compressorEnd: { type: Date },
    restarts: { type: Number, default: 0 },
    waterLiters: { type: Number, default: 0 },
    waterAirBaseLiters: { type: Number, default: 0 },
    waterMembraneLiters: { type: Number, default: 0 },
    timeApproximate: { type: Boolean, default: false },
    lastSeenAt: { type: Date, required: true },
  },
  { timestamps: true, collection: 'water_pressure' }
);
WaterPressureRunSchema.index({ rootId: 1, runId: 1 }, { unique: true });
WaterPressureRunSchema.index({ rootId: 1, pumpStart: 1 });

const WaterMeterReadingSchema = new Schema<WaterMeterReading>(
  {
    rootId: { type: String, required: true },
    readAt: { type: Date, required: true },
    valueM3: { type: Number, required: true, min: 0 },
    note: { type: String, default: '', trim: true },
  },
  { timestamps: true, collection: 'water_meter' }
);
WaterMeterReadingSchema.index({ rootId: 1, readAt: 1 });

export const WaterPressureRunModel = model<WaterPressureRun>('WaterPressureRun', WaterPressureRunSchema);
export const WaterMeterReadingModel = model<WaterMeterReading>('WaterMeterReading', WaterMeterReadingSchema);
