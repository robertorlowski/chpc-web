// Ładowanie CWU w kotle, które zasila ta pompa ciepła (kolekcja heat_pump_cwu_loading, jeden dokument na
// pompę). Ustawia je kocioł przez API (PUT /hp/cwu-loading), odświeżając co minutę; w bazie, żeby restart
// serwera nie zostawił pompy na podwyższonych temperaturach ani nie zgubił trwającego ładowania.
import { Schema, model } from 'mongoose';

export interface CwuLoadingEntry {
  rootId: string;
  active: boolean;
  /** początek ładowania (od kotła) */
  since?: Date;
  /** ostatnie zgłoszenie od kotła; bez odświeżenia przez CWU_LOADING_TTL_MS ładowanie wygasa */
  refreshedAt: Date;
  /** CWU z peletu w kotle: pompa wstrzymana (OFF) do ostygnięcia kotła; wygasa jak ładowanie */
  pelletBlock?: boolean;
}

const CwuLoadingSchema = new Schema<CwuLoadingEntry>(
  {
    rootId: { type: String, required: true, unique: true },
    active: { type: Boolean, required: true },
    since: { type: Date },
    refreshedAt: { type: Date, required: true },
    pelletBlock: { type: Boolean },
  },
  { timestamps: true, collection: 'heat_pump_cwu_loading' }
);

export const CwuLoadingModel = model<CwuLoadingEntry>('HeatPumpCwuLoading', CwuLoadingSchema);
