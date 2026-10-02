import { Schema, model } from 'mongoose';
import { SwitchActivation } from '../types';

// Włączenia przekaźników (kolekcja switch_activations): jeden dokument od włączenia
// do wyłączenia, według stanu zgłaszanego przez sterownik (nie według polecenia chmury).
const SwitchActivationSchema = new Schema<SwitchActivation>(
  {
    rootId: { type: String, required: true },
    deviceId: { type: String, required: true },
    relay: { type: Number, required: true, min: 1 },
    onAt: { type: Date, required: true },
    offAt: { type: Date, default: null },
    source: { type: String, enum: ['schedule', 'app', 'controller'], required: true },
    approximate: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'switch_activations' }
);
SwitchActivationSchema.index({ rootId: 1, onAt: 1 });
SwitchActivationSchema.index({ rootId: 1, relay: 1, offAt: 1 });

export const SwitchActivationModel = model<SwitchActivation>('SwitchActivation', SwitchActivationSchema);
