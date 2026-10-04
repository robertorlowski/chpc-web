// Zlecenia zmiany parametru regulatora kotła z aplikacji (kolekcja pellet_boiler_pelux200_commands).
// Aplikacja tworzy zlecenie (pending), sterownik pieca odbiera je pojedynczo (sent), wysyła do
// regulatora (0x33 parametr kotła, 0x34 mieszacz, 0x3B włącz/wyłącz regulator) i odsyła wynik
// (done albo error).
import { Schema, model } from 'mongoose';
import { PelletBoilerCommandEntry } from '../types';

const PelletBoilerCommandSchema = new Schema<PelletBoilerCommandEntry>(
  {
    rootId: { type: String, required: true },
    kind: { type: String, enum: ['ecomax', 'mixer', 'control'], required: true },
    /** numer mieszacza od 1 (tylko kind = mixer) */
    mixer: { type: Number },
    index: { type: Number, required: true },
    /** surowa wartość dla regulatora (bajt, przed krokiem i przesunięciem z ecomax-parameters.ts) */
    value: { type: Number, required: true },
    /** wartość przed zmianą (surowa, z ostatniego odczytu ustawień) */
    previous: { type: Number },
    label: { type: String },
    status: { type: String, enum: ['pending', 'sent', 'done', 'error', 'replaced'], required: true, default: 'pending' },
    error: { type: String },
    sentAt: { type: Date },
    doneAt: { type: Date },
  },
  { timestamps: true, collection: 'pellet_boiler_pelux200_commands' }
);
PelletBoilerCommandSchema.index({ rootId: 1, createdAt: -1 });
PelletBoilerCommandSchema.index({ rootId: 1, status: 1, createdAt: 1 });

export const PelletBoilerCommandModel = model<PelletBoilerCommandEntry>(
  'PelletBoilerCommand', PelletBoilerCommandSchema);
