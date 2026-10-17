// Kolejka maili do wysłania przez sterownik (przekaźnik poczty, 2026-10-17): Render na darmowym planie blokuje
// wychodzące SMTP, więc przy MAIL_RELAY=1 maile wysyła z domowego łącza włącznik, a zapasowo sterownik co
// (core/services/mail-relay.service.ts). Jeden dokument na mail: gotowa wiadomość MIME (raw) i koperta (to).
// Dokumenty znikają dobę po utworzeniu (TTL), a mail nie wysłany przed expiresAt dostaje status expired.
import mongoose, { Document, Model, Schema } from 'mongoose';

export type MailOutboxStatus = 'pending' | 'sending' | 'sent' | 'error' | 'expired';

export interface MailOutboxEntry {
  to: string[];
  subject: string;
  /** cała wiadomość (nagłówki i treść MIME) złożona na serwerze; sterownik wysyła ją bez zmian (DATA) */
  raw: string;
  status: MailOutboxStatus;
  attempts: number;
  /** sterownik, który wziął mail (Root ID), i do kiedy: po leaseUntil bez wyniku mail wraca do kolejki */
  leasedBy?: string | null;
  leaseUntil?: Date | null;
  /** potwierdzenie z zaszyfrowanego zadania: wynik przyjmowany tylko od sterownika, który je odszyfrował */
  receipt?: string | null;
  /** sterowniki, którym wysyłka tego maila się nie udała: następna próba idzie najpierw do innego */
  failedBy?: string[];
  sentBy?: string | null;
  sentAt?: Date | null;
  error?: string | null;
  expiresAt: Date;
  createdAt?: Date;
}

export type MailOutboxDocument = MailOutboxEntry & Document;

const MailOutboxSchema = new Schema<MailOutboxDocument>(
  {
    to: { type: [String], required: true },
    subject: { type: String, default: '' },
    raw: { type: String, required: true },
    status: { type: String, enum: ['pending', 'sending', 'sent', 'error', 'expired'], default: 'pending' },
    attempts: { type: Number, default: 0 },
    leasedBy: { type: String, default: null },
    leaseUntil: { type: Date, default: null },
    receipt: { type: String, default: null },
    failedBy: { type: [String], default: [] },
    sentBy: { type: String, default: null },
    sentAt: { type: Date, default: null },
    error: { type: String, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'mail_outbox' },
);

MailOutboxSchema.index({ status: 1, createdAt: 1 });
MailOutboxSchema.index({ createdAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

export const MailOutboxModel: Model<MailOutboxDocument> =
  mongoose.models.MailOutbox || mongoose.model<MailOutboxDocument>('MailOutbox', MailOutboxSchema);
