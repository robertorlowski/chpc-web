import { Schema } from 'mongoose';
import { ScheduleEntry, ScheduleType, timePattern, WeekDay } from '../types';

// Harmonogramy są osadzone w urządzeniu (pole schedules).
export const ScheduleEntrySchema = new Schema<ScheduleEntry>(
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
