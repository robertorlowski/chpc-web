import { Schema, model } from 'mongoose';
import { DeviceType } from '../../../core/types';
import { WaterPressureTankRun } from '../types';

// Uruchomienia pompy hydroforu: jeden dokument na runId, aktualizowany co 1 s
// przez sterownik (POST /water-pressure-tank/add). runId nadaje sterownik (licznik
// w NVS, pierwszy numer losowy, żeby po wyczyszczeniu pamięci nie trafić w stare
// rekordy), stąd indeks unikalny {rootId, runId}. Szacunek wody jest
// zapisywany przy utworzeniu i nie zmienia się po zmianie ustawień.
const WaterPressureTankRunSchema = new Schema<WaterPressureTankRun>(
  {
    rootId: { type: String, required: true },
    deviceType: { type: String, enum: Object.values(DeviceType), required: true },
    deviceId: { type: String, required: true },
    runId: { type: Number, required: true },
    pumpStart: { type: Date, required: true },
    pumpEnd: { type: Date, required: true },
    compressorStart: { type: Date },
    compressorEnd: { type: Date },
    restarts: { type: Number, default: 0 },
    waterLiters: { type: Number, default: 0 },
    waterAirBaseLiters: { type: Number, default: 0 },
    waterMembraneLiters: { type: Number, default: 0 },
    timeApproximate: { type: Boolean, default: false },
    lastSeenAt: { type: Date, required: true },
  },
  { timestamps: true, collection: 'water_pressure_tank' }
);
WaterPressureTankRunSchema.index({ rootId: 1, runId: 1 }, { unique: true });
WaterPressureTankRunSchema.index({ rootId: 1, pumpStart: 1 });

export const WaterPressureTankRunModel = model<WaterPressureTankRun>('WaterPressureTankRun', WaterPressureTankRunSchema);
