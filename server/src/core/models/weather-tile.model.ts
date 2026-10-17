// Kafelki pogody na liście sterowników (/devices): jedna miejscowość na dokument. Kafelek „Dom” (home: true)
// powstaje sam z WEATHER_LOCATION przy starcie serwera; jego położenie daje temperaturę dla GET /temperature.
// Kolejność (sortOrder) jest wspólna z kafelkami sterowników (PUT /devices/order), hidden = kafelek ukryty
// (widoczny tylko w trybie „Zmień kolejność”); z kontami oba w układzie konta (tile-layout.service.ts), a ownerId
// = konto, które dodało kafelek (bez ownerId: kafelki sprzed kont i „Dom”, użytkownika systemowego).
// current = kafelek bieżącej lokalizacji (od 2026-10-17): bez współrzędnych, bo położenie zna tylko przeglądarka
// (każde urządzenie pokazuje pogodę tam, gdzie jest); najwyżej jeden na konto, włącznik go nie pobiera.
// Zasady: core/services/weather-tile.service.ts.
import { Schema, model } from 'mongoose';

export interface WeatherTileDocument {
  _id: unknown;
  name: string;
  lat?: number | null;
  lon?: number | null;
  sortOrder?: number;
  hidden: boolean;
  home: boolean;
  current?: boolean;
  ownerId?: string | null;
}

const WeatherTileSchema = new Schema<WeatherTileDocument>(
  {
    name: { type: String, required: true, trim: true },
    lat: { type: Number, required: function (this: WeatherTileDocument) { return !this.current; } },
    lon: { type: Number, required: function (this: WeatherTileDocument) { return !this.current; } },
    sortOrder: { type: Number },
    hidden: { type: Boolean, default: false },
    home: { type: Boolean, default: false },
    current: { type: Boolean, default: false },
    ownerId: { type: String, default: null, index: true },
  },
  { timestamps: true, collection: 'weather_tiles' }
);

export const WeatherTileModel = model<WeatherTileDocument>('WeatherTile', WeatherTileSchema);
