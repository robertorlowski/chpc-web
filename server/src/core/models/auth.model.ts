// Logowanie (2026-10-11): kody i linki z maila (auth_codes) oraz sesje (sessions). W bazie są tylko skróty
// SHA-256 kodu, linku i tokenu sesji, nie same wartości. Oba rodzaje dokumentów wygasają same (indeks TTL).
import mongoose, { Schema } from 'mongoose';

/** login: logowanie i rejestracja; email-change: nowy adres; delete-account: potwierdzenie usunięcia konta */
export type AuthCodePurpose = 'login' | 'email-change' | 'delete-account';

export interface AuthCodeEntry {
  _id: mongoose.Types.ObjectId;
  purpose: AuthCodePurpose;
  /** adres, na który poszedł mail (przy zmianie e-maila nowy adres) */
  email: string;
  /** konto, którego dotyczy (zmiana e-maila, usunięcie konta) */
  userId?: string;
  codeHash?: string;
  tokenHash?: string;
  attempts: number;
  expiresAt: Date;
  createdAt: Date;
}

const AuthCodeSchema = new Schema<AuthCodeEntry>(
  {
    purpose: { type: String, enum: ['login', 'email-change', 'delete-account'], required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    userId: { type: String },
    codeHash: { type: String },
    tokenHash: { type: String },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'auth_codes' },
);
AuthCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
AuthCodeSchema.index({ purpose: 1, email: 1, createdAt: -1 });
AuthCodeSchema.index({ tokenHash: 1 });

export const AuthCodeModel = mongoose.model<AuthCodeEntry>('AuthCode', AuthCodeSchema);

export interface SessionEntry {
  _id: mongoose.Types.ObjectId;
  tokenHash: string;
  userId: string;
  /** „Zapamiętać na 7 dni”: stałe 7 dni od zalogowania; bez tego 24 h od ostatniego użycia */
  remember: boolean;
  expiresAt: Date;
  lastSeenAt: Date;
  createdAt: Date;
}

const SessionSchema = new Schema<SessionEntry>(
  {
    tokenHash: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    remember: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'sessions' },
);
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
SessionSchema.index({ userId: 1 });

export const SessionModel = mongoose.model<SessionEntry>('Session', SessionSchema);
