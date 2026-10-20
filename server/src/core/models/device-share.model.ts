// Udostępnienia sterowników (kolekcja device_shares, od 2026-10-11): właściciel daje osobie (po e-mailu) dostęp
// do wybranych zakładek sterownika. userId jest pusty, dopóki zaproszona osoba nie założy konta (przy
// logowaniu udostępnienia po jej e-mailu dostają userId).
import mongoose, { Schema } from 'mongoose';

export interface DeviceShareEntry {
  _id: mongoose.Types.ObjectId;
  rootId: string;
  ownerId: string;
  email: string;
  userId?: string | null;
  /** ścieżki zakładek klienta: '/', '/data', '/chart', '/schedules', '/alarms', '/settings'; 'simple' = „Panel prosty”
   *  (kafelek z dużymi przyciskami na liście zamiast widoków; access.service SIMPLE_TAB) */
  tabs: string[];
  createdAt: Date;
  updatedAt: Date;
}

const DeviceShareSchema = new Schema<DeviceShareEntry>(
  {
    rootId: { type: String, required: true },
    ownerId: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    userId: { type: String, default: null },
    tabs: { type: [String], default: [] },
  },
  { timestamps: true, collection: 'device_shares' },
);
DeviceShareSchema.index({ rootId: 1, email: 1 }, { unique: true });
DeviceShareSchema.index({ userId: 1 });
DeviceShareSchema.index({ email: 1 });

export const DeviceShareModel = mongoose.model<DeviceShareEntry>('DeviceShare', DeviceShareSchema);
