import { Schema, model, InferSchemaType } from 'mongoose';
import { SettingsEntry, TimeSlot } from '../types';

const TimeSlotSchema = new Schema<TimeSlot>(
  {
    slot_start_hour: { type: Number },
    slot_start_minute: { type: Number },
    slot_stop_hour: { type: Number },
    slot_stop_minute: { type: Number },
  },
  { _id: false }
);

// Starsze ustawienia czasowe: osobna kolekcja i pole settings urządzenia.
export const SettingsEntrySchema = new Schema<SettingsEntry>(
  {
    rootId: { type: String, required: true, index: true },
    night_hour: { type: TimeSlotSchema },
    settings: { type: [TimeSlotSchema] },
    cwu_settings: { type: [TimeSlotSchema] },
  },
  { timestamps: true, _id: true, collection: 'settings' }
);

// To do usunięcia po nadpisaniu programu na ESP32
export type SettingsEntryDoc = InferSchemaType<typeof SettingsEntrySchema>;
export const SettingsEntryModel = model<SettingsEntryDoc>('SettingsEntry', SettingsEntrySchema);
