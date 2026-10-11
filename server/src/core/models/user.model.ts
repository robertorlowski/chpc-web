// Konta użytkowników (kolekcja users, od 2026-10-11): logowanie kodem z maila, dane osobowe, jedna lokalizacja
// konta i kolejność kafelków (osobno dla każdego użytkownika). Użytkownik systemowy
// (login „system”, hasło w SYSTEM_PASSWORD) to dokument z isSystem i bez e-maila; widzi wszystkie sterowniki.
import mongoose, { Schema } from 'mongoose';

export interface UserLocation {
  lat: number;
  lng: number;
}

export interface UserEntry {
  _id: mongoose.Types.ObjectId;
  /** małe litery; brak tylko u użytkownika systemowego */
  email?: string;
  isSystem?: boolean;
  firstName?: string;
  lastName?: string;
  street?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  location?: UserLocation | null;
  /** kolejność kafelków na /devices (tryb „Zmień kolejność”) */
  deviceOrder?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<UserEntry>(
  {
    email: { type: String, trim: true, lowercase: true },
    isSystem: { type: Boolean },
    firstName: { type: String, trim: true, default: '' },
    lastName: { type: String, trim: true, default: '' },
    street: { type: String, trim: true, default: '' },
    postalCode: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    country: { type: String, trim: true, default: '' },
    location: { type: new Schema<UserLocation>({ lat: Number, lng: Number }, { _id: false }), default: null },
    deviceOrder: { type: [String], default: undefined },
  },
  { timestamps: true, collection: 'users' },
);

// e-mail unikalny wśród kont z e-mailem (użytkownik systemowy go nie ma)
UserSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } });

export const UserModel = mongoose.model<UserEntry>('User', UserSchema);
