import { Schema, model, InferSchemaType } from 'mongoose';

const OperationEntrySchema = new Schema(
  {
    force: { type: String },
    work_mode: { type: String },
    sump_heater: { type: String },
    cold_pomp: { type: String },
    hot_pomp: { type: String },
    co_min: { type: String },
    co_max: { type: String },
    cwu_min: { type: String },
    cwu_max: { type: String },
    working_watt: { type: String },
    eev_max_pulse_open: { type: String },
    eev_setpoint: { type: String },
  },
  { collection: 'operations', timestamps: true }
);

export type OperationEntryDoc = InferSchemaType<typeof OperationEntrySchema>;
export const OperationEntryModel = model<OperationEntryDoc>('OperationEntry', OperationEntrySchema);