import { Schema, model, InferSchemaType } from 'mongoose';
import { TimeSlotSchema } from './subdocs';

const SettingsEntrySchema = new Schema(
  {
    night_hour: { type: TimeSlotSchema },
    settings: { type: [TimeSlotSchema] },
    cwu_settings: { type: [TimeSlotSchema] },
  },
  { collection: 'settings', timestamps: true }
);

export type SettingsEntryDoc = InferSchemaType<typeof SettingsEntrySchema>;
export const SettingsEntryModel = model<SettingsEntryDoc>('SettingsEntry', SettingsEntrySchema);