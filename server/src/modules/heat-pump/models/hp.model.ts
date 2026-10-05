// Model telemetrii pompy (kolekcja hp), zapisywanej przez addHpData z POST /hp/add.
// Nowe pole telemetrii trzeba dodać tutaj, w types.ts (serwer i klient) i w widokach,
// inaczej zostanie po cichu pominięte przy zapisie.
import { Schema, model, InferSchemaType } from 'mongoose';
import { DeviceType } from '../../../core/types';
import { HpEntry, HpMetrics } from '../types';
import { PvMetricsSchema } from './pv.model';

// Klucze JSON z CHPC (pole HP). Nie zapisywane m.in.: EEV_pulse, FW.
const HpMetricsSchema = new Schema<HpMetrics>(
  {
    Tbe: { type: Number },
    Tae: { type: Number },
    Tco: { type: Number },
    Tho: { type: Number },
    Ttarget: { type: Number },
    Tsump: { type: Number },
    EEV_dt: { type: Number },
    Tcwu: { type: Number },
    Tmax: { type: Number },
    Tmin: { type: Number },
    Tcwu_max: { type: Number },
    Tcwu_min: { type: Number },
    Watts: { type: Number },
    EEV: { type: Number },
    EEV_pos: { type: Number },
    HCS: { type: Boolean },
    CCS: { type: Boolean },
    HPS: { type: Boolean },
    F: { type: Boolean },
    CWUS: { type: Boolean },
    CWU: { type: Boolean },
    CO: { type: Boolean },
    SHS: { type: Boolean },
    WWatt: { type: Number },
    EEVmax: { type: Number },
    EEVmin: { type: Number },
    ERR: { type: Number },
    ERRn: { type: Number },
    ERRc: { type: Number },
    lt_pow: { type: Number },
    lt_hp_on: { type: Number },
  },
  { _id: false }
);

// Telemetria pompy (kolekcja hp). Schemat ścisły: klucz spoza listy nie jest zapisywany
// (np. cop_min, cop_max, controller_mode, liczniki diagnostyczne co).
// Zapytania idą po rootId + createdAt (timestamps).
const HpEntrySchema = new Schema<HpEntry>(
  {
    rootId: { type: String, required: true, index: true },
    deviceType: { type: String, enum: Object.values(DeviceType), required: true },
    deviceId: { type: String, required: true, index: true },
    HP: { type: HpMetricsSchema },
    PV: { type: PvMetricsSchema },
    time: { type: String },
    co_pomp: { type: Boolean },
    cwu_pomp: { type: Boolean },
    pv_power: { type: Boolean },
    schedule_on: { type: Boolean },
    // co od 1.2.0: work_mode MANUAL / AUTO / OFF i temp_min / temp_max; starsze: M / A / CWU / OFF i pary co_* / cwu_*
    work_mode: { type: String },
    temp_min: { type: Number },
    temp_max: { type: Number },
    co_min: { type: String },
    co_max: { type: String },
    cwu_min: { type: String },
    cwu_max: { type: String },
    t_min: { type: Number },
    t_max: { type: Number },
    cop: { type: Number },
    t_out: {type: Number},
    // kod błędu CHPC, gdy w tym odczycie pojawiło się nowe zdarzenie (HP.ERRn się zmienił)
    error_code: { type: Number }
  },
  { timestamps: true, _id: true, collection: 'hp' }
);

export type HpEntryDoc = InferSchemaType<typeof HpEntrySchema>;
export const HpEntryModel = model<HpEntryDoc>('HpEntry', HpEntrySchema);
