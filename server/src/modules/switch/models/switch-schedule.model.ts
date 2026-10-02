import { Schema, model } from 'mongoose';
import { WeekDay } from '../../../core/types';
import { SwitchSchedule, timePattern } from '../types';

// Harmonogramy przekaźników włącznika (kolekcja switch_schedules). Osobna kolekcja,
// a nie devices.schedules: wpis ma numer przekaźnika i nie ma pól pompy (typ, temperatury).
const SwitchScheduleSchema = new Schema<SwitchSchedule>(
  {
    rootId: { type: String, required: true },
    relay: { type: Number, required: true, min: 1 },
    enabled: { type: Boolean, default: true },
    dayOfWeek: {
      type: Number,
      enum: Object.values(WeekDay).filter((value) => typeof value === 'number'),
    },
    date: { type: Date },
    startTime: { type: String, required: true, match: timePattern },
    endTime: { type: String, required: true, match: timePattern },
  },
  { timestamps: true, collection: 'switch_schedules' }
);
SwitchScheduleSchema.index({ rootId: 1, relay: 1 });

export const SwitchScheduleModel = model<SwitchSchedule>('SwitchSchedule', SwitchScheduleSchema);
