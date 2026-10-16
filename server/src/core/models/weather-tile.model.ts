// Kafelki pogody na liście sterowników (/devices): jedna miejscowość na dokument. Kafelek „Dom” (home: true)
// powstaje sam z WEATHER_LOCATION przy starcie serwera; jego położenie daje temperaturę dla GET /temperature.
// Kolejność (sortOrder) jest wspólna z kafelkami sterowników (PUT /devices/order), hidden = kafelek ukryty
// (widoczny tylko w trybie „Zmień kolejność”). Zasady: core/services/weather-tile.service.ts.
import { Schema, model } from 'mongoose';

export interface WeatherTileDocument {
  _id: unknown;
  name: string;
  lat: number;
  lon: number;
  sortOrder?: number;
  hidden: boolean;
  home: boolean;
}

const WeatherTileSchema = new Schema<WeatherTileDocument>(
  {
    name: { type: String, required: true, trim: true },
    lat: { type: Number, required: true },
    lon: { type: Number, required: true },
    sortOrder: { type: Number },
    hidden: { type: Boolean, default: false },
    home: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'weather_tiles' }
);

export const WeatherTileModel = model<WeatherTileDocument>('WeatherTile', WeatherTileSchema);
