// Harmonogram kotła (kolekcje pellet_boiler_pelux200_schedules i ..._schedule_settings).
// Wpis: CWU od–do albo praca kotła (włączony/wyłączony) w oknie godzin (dzień tygodnia albo data, jak
// harmonogram włącznika), osobno dla trybu pracy „heat-pump” (pompa ciepła) i „pellet”. Ustawienia:
// „Praca kotła” Włączony/Wyłączony (enabled), CWU i praca poza harmonogramem dla każdego trybu, nastawy
// kotła stosowane przy przełączeniu trybu (profiles) i ostatnio zastosowany stan.
import { Schema, model } from 'mongoose';
import { WeekDay } from '../../../core/types';
import { PelletBoilerScheduleEntry, PelletBoilerScheduleSettings } from '../types';

const time = /^([01]\d|2[0-3]):([0-5]\d)$/;
const mode = { type: String, enum: ['heat-pump', 'pellet'] };
const cwu = { cwuFrom: Number, cwuTo: Number };
const work = { type: String, enum: ['on', 'off'] };

const PelletBoilerScheduleSchema = new Schema<PelletBoilerScheduleEntry>(
  {
    rootId: { type: String, required: true },
    type: { type: String, enum: ['cwu', 'work'], default: 'cwu' },
    mode: { ...mode, required: true },
    enabled: { type: Boolean, default: true },
    on: { type: Boolean },
    dayOfWeek: { type: Number, enum: Object.values(WeekDay).filter((v) => typeof v === 'number') },
    date: { type: Date },
    startTime: { type: String, match: time, required: true },
    endTime: { type: String, match: time, required: true },
    cwuFrom: { type: Number },
    cwuTo: { type: Number },
  },
  { timestamps: true, collection: 'pellet_boiler_pelux200_schedules' }
);
PelletBoilerScheduleSchema.index({ rootId: 1, mode: 1 });

export const PelletBoilerScheduleModel = model<PelletBoilerScheduleEntry>(
  'PelletBoilerSchedule', PelletBoilerScheduleSchema);

const PelletBoilerScheduleSettingsSchema = new Schema<PelletBoilerScheduleSettings>(
  {
    rootId: { type: String, required: true, unique: true },
    enabled: { type: Boolean, default: false },
    defaults: { 'heat-pump': { ...cwu, work }, pellet: { ...cwu, work } },
    // nastawy trybu: klucz „ecomax:<nr>” albo „mixer<n>:<nr>” → wartość surowa
    profiles: { 'heat-pump': { type: Schema.Types.Mixed }, pellet: { type: Schema.Types.Mixed } },
    lastApplied: { mode, ...cwu, work, paused: Boolean },
    lastAppliedAt: { type: Date },
    lastError: { type: String },
  },
  { timestamps: true, collection: 'pellet_boiler_pelux200_schedule_settings', minimize: false }
);

export const PelletBoilerScheduleSettingsModel = model<PelletBoilerScheduleSettings>(
  'PelletBoilerScheduleSettings', PelletBoilerScheduleSettingsSchema);
