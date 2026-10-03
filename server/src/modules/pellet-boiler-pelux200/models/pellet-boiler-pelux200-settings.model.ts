// Ostatni odczyt ustawień regulatora kotła (kolekcja pellet_boiler_pelux200_settings, jeden
// dokument na rootId, POST /pellet-boiler-pelux200/settings). Surowe odpowiedzi regulatora
// (hex, dane ramki bez nagłówka) — rozkodowanie przy odczycie (ecomax-parameters.ts), więc
// poprawki tabeli parametrów działają też na zapisanych danych.
import { Schema, model } from 'mongoose';
import { DeviceType } from '../../../core/types';
import { PelletBoilerSettingsRaw } from '../types';

export interface PelletBoilerSettingsEntry extends PelletBoilerSettingsRaw {
  rootId: string;
  deviceType?: DeviceType;
  deviceId?: string;
  readAt: Date;
}

const hex = { type: String };

const PelletBoilerSettingsSchema = new Schema<PelletBoilerSettingsEntry>(
  {
    rootId: { type: String, required: true, unique: true },
    deviceType: { type: String, enum: Object.values(DeviceType) },
    deviceId: String,
    readAt: { type: Date, required: true },
    ecomax_parameters: hex,
    mixer_parameters: hex,
    thermostat_parameters: hex,
    schedules: hex,
    regulator_data_schema: hex,
  },
  { timestamps: true, collection: 'pellet_boiler_pelux200_settings' }
);

export const PelletBoilerSettingsModel = model<PelletBoilerSettingsEntry>(
  'PelletBoilerSettings', PelletBoilerSettingsSchema);
