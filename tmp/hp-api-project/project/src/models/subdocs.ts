import { Schema, model, InferSchemaType } from 'mongoose';

const HpMetricsSchema = new Schema(
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
    lt_pow: { type: Number },
    lt_hp_on: { type: Number },
  },
  { _id: false }
);

const PvMetricsSchema = new Schema(
  {
    total_power: { type: Number },
    total_prod: { type: Number },
    total_prod_today: { type: Number },
    temperature: { type: Number },
  },
  { _id: false }
);

const TimeSlotSchema = new Schema(
  {
    slot_start_hour: { type: Number },
    slot_start_minute: { type: Number },
    slot_stop_hour: { type: Number },
    slot_stop_minute: { type: Number },
  },
  { _id: false }
);
