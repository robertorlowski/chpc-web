// Firmware sterowników aktualizowanych przez sieć (OTA): pliki obrazów
// (firmware_images) i oferta, czyli wersja, którą sterowniki dostają przy
// zgłoszeniu (firmware_offers). Plik ma ok. 1 MB, więc mieści się w jednym
// dokumencie (limit 16 MB) i nie potrzeba GridFS. Zasady: core/services/firmware.service.ts.
import { Schema, model } from 'mongoose';
import { DeviceType } from '../types';

export interface FirmwareImage {
  deviceType: DeviceType;
  version: string;
  data: Buffer;
  size: number;
  /** 64 znaki hex, małe litery; sterownik sprawdza nią pobrany obraz */
  sha256: string;
}

export interface FirmwareOffer {
  deviceType: DeviceType;
  /** wersja oferowana sterownikom */
  version: string;
  /** poprzednia oferowana wersja; jej plik też jest trzymany (powrót jednym kliknięciem) */
  previousVersion?: string;
  enabled: boolean;
}

const FirmwareImageSchema = new Schema<FirmwareImage>(
  {
    deviceType: { type: String, enum: Object.values(DeviceType), required: true },
    version: { type: String, required: true },
    data: { type: Buffer, required: true },
    size: { type: Number, required: true },
    sha256: { type: String, required: true },
  },
  { timestamps: true, collection: 'firmware_images' }
);
FirmwareImageSchema.index({ deviceType: 1, version: 1 }, { unique: true });

const FirmwareOfferSchema = new Schema<FirmwareOffer>(
  {
    deviceType: { type: String, enum: Object.values(DeviceType), required: true, unique: true },
    version: { type: String, required: true },
    previousVersion: { type: String },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'firmware_offers' }
);

export const FirmwareImageModel = model<FirmwareImage>('FirmwareImage', FirmwareImageSchema);
export const FirmwareOfferModel = model<FirmwareOffer>('FirmwareOffer', FirmwareOfferSchema);
