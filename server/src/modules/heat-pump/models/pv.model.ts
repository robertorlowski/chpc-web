// Model odczytów PV z DTU Hoymiles (kolekcja pv, POST /pv/add) i schemat
// podsumowania PV osadzany w rekordach hp.
import { Schema, model, InferSchemaType } from 'mongoose';
import { DeviceType } from '../../../core/types';
import { PvEntry, PvMetrics, PvPanel } from '../types';

// Podsumowanie PV; osadzane też w rekordach hp (pole PV).
export const PvMetricsSchema = new Schema<PvMetrics>(
  {
    total_power: { type: Number },
    total_prod: { type: Number },
    total_prod_today: { type: Number },
    temperature: { type: Number },
  },
  { _id: false }
);

// Jeden port mikrofalownika. status, alarm_code, alarm_count i link zapisywane
// surowo: kody DTU nie są udokumentowane.
const PvPanelSchema = new Schema<PvPanel>(
  {
    serial: { type: String },
    port: { type: Number },
    power: { type: Number },
    prod_today: { type: Number },
    prod_total: { type: Number },
    temperature: { type: Number },
    pv_voltage: { type: Number },
    pv_current: { type: Number },
    grid_voltage: { type: Number },
    grid_frequency: { type: Number },
    status: { type: Number },
    alarm_code: { type: Number },
    alarm_count: { type: Number },
    link: { type: Number },
  },
  { _id: false }
);

// Odczyty PV są osobno od telemetrii HP. Rekord hp dostaje przy zapisie
// tylko PV.total_power, potrzebne do bilansu energii (addHp).
const PvEntrySchema = new Schema<PvEntry>(
  {
    rootId: { type: String, required: true },
    deviceType: { type: String, enum: Object.values(DeviceType), required: true },
    deviceId: { type: String, required: true },
    time: { type: String },
    total_power: { type: Number },
    total_prod: { type: Number },
    total_prod_today: { type: Number },
    temperature: { type: Number },
    pv_power: { type: Boolean },
    panels: { type: [PvPanelSchema], default: undefined },
  },
  { timestamps: true, _id: true, collection: 'pv' }
);
PvEntrySchema.index({ rootId: 1, createdAt: -1 });
// czyszczenie szczegółów paneli filtruje po samym createdAt
PvEntrySchema.index({ createdAt: 1 });

export type PvEntryDoc = InferSchemaType<typeof PvEntrySchema>;
export const PvEntryModel = model<PvEntryDoc>('PvEntry', PvEntrySchema);
