import { Schema, model } from 'mongoose';
import { WaterMeterReading } from '../types';

// Ręczne odczyty wodomierza (kolekcja water_meter).
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

export const WaterMeterReadingModel = model<WaterMeterReading>('WaterMeterReading', WaterMeterReadingSchema);
