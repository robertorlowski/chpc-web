import { Schema } from 'mongoose';
import { WaterTank } from '../types';

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
