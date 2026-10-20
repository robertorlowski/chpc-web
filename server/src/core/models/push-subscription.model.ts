// Subskrypcje Web Push (kolekcja push_subscriptions, od 2026-10-21): jedna na przeglądarkę / telefon użytkownika,
// zapisana po „Włącz na tym urządzeniu” w karcie „Powiadomienia” (/account). endpoint i klucze pochodzą
// z PushManager przeglądarki; serwer wysyła przez web-push (VAPID). Subskrypcja, której usługa push już nie zna
// (404 / 410), jest kasowana przy wysyłce (core/services/push.service.ts).
import mongoose, { Schema } from 'mongoose';

export interface PushSubscriptionEntry {
  _id: mongoose.Types.ObjectId;
  userId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  /** opis z przeglądarki (np. „Chrome · Android”), do listy w karcie „Powiadomienia” */
  label: string;
  createdAt: Date;
  lastUsedAt?: Date | null;
}

const PushSubscriptionSchema = new Schema<PushSubscriptionEntry>(
  {
    userId: { type: String, required: true },
    endpoint: { type: String, required: true },
    keys: { type: new Schema({ p256dh: { type: String, required: true }, auth: { type: String, required: true } }, { _id: false }), required: true },
    label: { type: String, default: '' },
    lastUsedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'push_subscriptions' },
);
PushSubscriptionSchema.index({ endpoint: 1 }, { unique: true });
PushSubscriptionSchema.index({ userId: 1 });

export const PushSubscriptionModel = mongoose.model<PushSubscriptionEntry>('PushSubscription', PushSubscriptionSchema);
