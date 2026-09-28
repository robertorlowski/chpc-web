import { Schema, model, InferSchemaType } from 'mongoose';
import { DeviceType } from '../../../core/devices/device.types';
import { HpEntry, HpMetrics } from '../types';
import { PvMetricsSchema } from './pv.model';

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

// Telemetria pompy (kolekcja hp). Schemat ścisły: klucz spoza listy nie jest zapisywany.
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
    work_mode: { type: String },
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
