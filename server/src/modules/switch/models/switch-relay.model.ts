import { Schema, model } from 'mongoose';
import { RELAY_MODES, SwitchRelay } from '../types';

// Przekaźniki włącznika (kolekcja switch_relays), jeden dokument na {rootId, relay}.
// Tworzone przy zgłoszeniu i przy każdym POST /switch/state według liczby przekaźników
// sterownika. Tryb jest trwały (w odróżnieniu od operacji pompy): restart serwera go nie kasuje.
const SwitchRelaySchema = new Schema<SwitchRelay>(
  {
    rootId: { type: String, required: true },
    deviceId: { type: String, required: true },
    relay: { type: Number, required: true, min: 1 },
    name: { type: String, default: '', trim: true, maxlength: 40 },
    mode: { type: String, enum: RELAY_MODES, default: 'schedule' },
    until: { type: Date },
    modeSource: { type: String, enum: ['app', 'controller'] },
    modeChangedAt: { type: Date },
    on: { type: Boolean, default: false },
    changedAt: { type: Date },
    lastSeenAt: { type: Date },
  },
  { timestamps: true, collection: 'switch_relays' }
);
SwitchRelaySchema.index({ rootId: 1, relay: 1 }, { unique: true });

export const SwitchRelayModel = model<SwitchRelay>('SwitchRelay', SwitchRelaySchema);
