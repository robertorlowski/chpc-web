import { Schema, model, InferSchemaType } from 'mongoose';
import { HpMetricsSchema, PvMetricsSchema, TimeSlotSchema } from './subdocs';

const HpEntrySchema = new Schema(
  {
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
  },
  { collection: 'hp_entries', timestamps: true }
);

export type HpEntryDoc = InferSchemaType<typeof HpEntrySchema>;
export const HpEntryModel = model<HpEntryDoc>('HpEntry', HpEntrySchema);