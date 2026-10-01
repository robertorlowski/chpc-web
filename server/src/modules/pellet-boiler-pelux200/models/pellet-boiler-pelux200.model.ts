// Model odczytów kotła pelletowego Pellux 200 (kolekcja pellet_boiler_pelux200,
// POST /pellet-boiler-pelux200/add). Schemat ścisły: pole spoza listy jest
// po cichu pomijane, więc nowe pole trzeba dopisać tutaj i w types.ts.
import { Schema, model } from 'mongoose';
import { DeviceType } from '../../../core/types';
import { PelletBoilerPelux200Entry } from '../types';

const number = { type: Number };
const flag = { type: Boolean };

const PelletBoilerPelux200Schema = new Schema<PelletBoilerPelux200Entry>(
  {
    rootId: { type: String, required: true },
    deviceType: { type: String, enum: Object.values(DeviceType), required: true },
    deviceId: { type: String, required: true },
    state: number,
    heating_temp: number,
    feeder_temp: number,
    water_heater_temp: number,
    outside_temp: number,
    return_temp: number,
    exhaust_temp: number,
    optical_temp: number,
    upper_buffer_temp: number,
    lower_buffer_temp: number,
    heating_target: number,
    water_heater_target: number,
    heating_status: number,
    water_heater_status: number,
    fuel_level: number,
    fan_power: number,
    boiler_load: number,
    boiler_power: number,
    fuel_consumption: number,
    lambda_level: number,
    fan: flag,
    feeder: flag,
    heating_pump: flag,
    water_heater_pump: flag,
    circulation_pump: flag,
    lighter: flag,
    alarm: flag,
  },
  { timestamps: true, collection: 'pellet_boiler_pelux200' }
);
PelletBoilerPelux200Schema.index({ rootId: 1, createdAt: -1 });

export const PelletBoilerPelux200Model = model<PelletBoilerPelux200Entry>(
  'PelletBoilerPelux200', PelletBoilerPelux200Schema);
