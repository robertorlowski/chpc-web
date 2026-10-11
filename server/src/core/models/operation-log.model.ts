// Dziennik operacji sterowników (kolekcja operation_log, od 2026-10-11; zakładka „Operacje”): kto, co (przed → po),
// status zlecenia, dlaczego i przy jakich warunkach. Wpisy kasuje indeks TTL po OPERATION_LOG_RETENTION_DAYS (5 dni,
// decyzja użytkownika). Zlecenia sterownika (np. kotła) są w refs; ich status przepisuje operation-log.service.ts.
import mongoose, { Schema } from 'mongoose';
import { OperationActor, OperationStatus } from '../types';

export const OPERATION_LOG_RETENTION_DAYS = 5;

export interface OperationLogEntry {
  _id: mongoose.Types.ObjectId;
  rootId: string;
  at: Date;
  actor: OperationActor;
  /** moduł albo miejsce: Ustawienia, Harmonogram, Cykl Zimy, Ładowanie CWU… */
  source: string;
  /** operacja w postaci „przed → po” (kilka zmian rozdzielonych „ · ”) */
  action: string;
  status: OperationStatus;
  /** kiedy operacja osiągnęła obecny status (np. potwierdzenie regulatora) */
  statusAt?: Date | null;
  error?: string | null;
  reason?: string | null;
  conditions?: string | null;
  /** identyfikatory zleceń sterownika składających się na operację */
  refs?: string[];
}

const OperationLogSchema = new Schema<OperationLogEntry>(
  {
    rootId: { type: String, required: true },
    at: { type: Date, required: true },
    actor: {
      type: new Schema({ type: { type: String, enum: ['user', 'system', 'controller'], required: true }, name: String, userId: String }, { _id: false }),
      required: true,
    },
    source: { type: String, required: true },
    action: { type: String, required: true },
    status: { type: String, enum: ['pending', 'sent', 'delivered', 'done', 'error', 'replaced'], required: true },
    statusAt: { type: Date, default: null },
    error: { type: String, default: null },
    reason: { type: String, default: null },
    conditions: { type: String, default: null },
    refs: { type: [String], default: undefined },
  },
  { collection: 'operation_log' },
);
OperationLogSchema.index({ rootId: 1, at: -1 });
OperationLogSchema.index({ refs: 1 });
OperationLogSchema.index({ at: 1 }, { expireAfterSeconds: OPERATION_LOG_RETENTION_DAYS * 24 * 60 * 60 });

export const OperationLogModel = mongoose.model<OperationLogEntry>('OperationLog', OperationLogSchema);
