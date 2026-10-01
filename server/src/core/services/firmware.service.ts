// Firmware sterowników (OTA): zapis obrazów w bazie, oferta dla sterowników i
// przycinanie starych wersji. W bazie jest oferowana wersja i jedna poprzednia
// (powrót bez ponownego wgrywania); starsze pliki są usuwane przy zmianie oferty.
// Kontrakt ze sterownikiem hydroforu: devices/water-pressure-tank/src/ota.cpp.
import { createHash } from 'crypto';
import { FirmwareImageModel, FirmwareOfferModel } from '../models/firmware.model';
import { DeviceType } from '../types';

// Partycja aplikacji OTA ESP32 (0x140000); większy obraz się nie zmieści.
export const MAX_FIRMWARE_BYTES = 1310720;
// Pierwszy bajt obrazu aplikacji ESP32 (nagłówek esptool).
const ESP_IMAGE_MAGIC = 0xe9;
// Wersja trafia do adresu pliku, więc tylko znaki bezpieczne w ścieżce.
const VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z._-]{0,31}$/;
export const MAX_DESCRIPTION_LENGTH = 500;

export class FirmwareError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const isValidFirmwareVersion = (version: string) => VERSION_PATTERN.test(version);

// Zapisuje obraz (ta sama wersja zostaje nadpisana) i od razu ustawia go jako
// oferowany. Sumę SHA-256 liczy serwer, żeby nie trzeba było jej przepisywać.
export async function saveFirmwareImage(deviceType: DeviceType, version: string, data: Buffer, description = '') {
  if (!isValidFirmwareVersion(version)) {
    throw new FirmwareError(400, 'Wersja: 1–32 znaki (litery, cyfry, kropka, myślnik, podkreślenie).');
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new FirmwareError(400, `Opis jest za długi: najwyżej ${MAX_DESCRIPTION_LENGTH} znaków.`);
  }
  if (data.length === 0 || data[0] !== ESP_IMAGE_MAGIC) {
    throw new FirmwareError(400, 'To nie jest obraz firmware ESP32 (oczekiwany plik .bin z pio run).');
  }
  if (data.length > MAX_FIRMWARE_BYTES) {
    throw new FirmwareError(400, `Plik jest za duży: ${data.length} B, limit ${MAX_FIRMWARE_BYTES} B.`);
  }

  const sha256 = createHash('sha256').update(data).digest('hex');
  await FirmwareImageModel.findOneAndUpdate(
    { deviceType, version },
    { $set: { data, size: data.length, sha256, description } },
    { upsert: true },
  );
  await activateFirmware(deviceType, version);
}

// Ustawia oferowaną wersję (istniejący plik). Dotychczasowa oferta staje się
// „poprzednią”, a pliki starsze niż te dwie są usuwane.
export async function activateFirmware(deviceType: DeviceType, version: string) {
  if (!(await FirmwareImageModel.exists({ deviceType, version }))) {
    throw new FirmwareError(404, `Brak pliku firmware w wersji ${version}.`);
  }
  const offer = await FirmwareOfferModel.findOne({ deviceType }).lean();
  const previousVersion = offer && offer.version !== version ? offer.version : offer?.previousVersion;
  await FirmwareOfferModel.findOneAndUpdate(
    { deviceType },
    { $set: { version, enabled: offer?.enabled ?? true, ...(previousVersion ? { previousVersion } : {}) } },
    { upsert: true },
  );
  await FirmwareImageModel.deleteMany({
    deviceType,
    version: { $nin: [version, ...(previousVersion ? [previousVersion] : [])] },
  });
}

// Usuwa plik wersji, która nie jest oferowana (oferowaną najpierw trzeba zastąpić inną).
export async function deleteFirmwareImage(deviceType: DeviceType, version: string) {
  const offer = await FirmwareOfferModel.findOne({ deviceType }).lean();
  if (offer?.version === version) {
    throw new FirmwareError(409, 'Nie można usunąć oferowanej wersji. Najpierw ustaw jako oferowaną inną.');
  }
  const result = await FirmwareImageModel.deleteOne({ deviceType, version });
  if (result.deletedCount === 0) throw new FirmwareError(404, `Brak pliku firmware w wersji ${version}.`);
  if (offer?.previousVersion === version) {
    await FirmwareOfferModel.updateOne({ deviceType }, { $unset: { previousVersion: 1 } });
  }
}

export async function setFirmwareEnabled(deviceType: DeviceType, enabled: boolean) {
  const result = await FirmwareOfferModel.updateOne({ deviceType }, { $set: { enabled } });
  if (result.matchedCount === 0) throw new FirmwareError(404, 'Nie wgrano jeszcze żadnego firmware.');
}

// Stan do strony /firmware: oferta i lista plików bez zawartości.
export async function getFirmwareSummary(deviceType: DeviceType) {
  const offer = await FirmwareOfferModel.findOne({ deviceType }).lean();
  const images = await FirmwareImageModel.find({ deviceType })
    .select('-data')
    .sort({ createdAt: -1 })
    .lean();
  return {
    enabled: offer?.enabled ?? false,
    version: offer?.version ?? null,
    previousVersion: offer?.previousVersion ?? null,
    images: images.map((image) => ({
      version: image.version,
      size: image.size,
      description: image.description ?? '',
      sha256: image.sha256,
      createdAt: (image as unknown as { createdAt: Date }).createdAt,
      active: image.version === offer?.version,
    })),
  };
}

export async function getFirmwareFile(deviceType: DeviceType, version: string) {
  return FirmwareImageModel.findOne({ deviceType, version }).lean();
}

// Oferta w odpowiedzi na zgłoszenie sterownika: {version, url, sha256}; brak,
// gdy aktualizacje są wyłączone albo nie ma pliku. baseUrl to adres serwera
// widziany przez sterownik (bez końcowego /).
export async function getFirmwareOffer(deviceType: DeviceType, baseUrl: string) {
  const offer = await FirmwareOfferModel.findOne({ deviceType }).lean();
  if (!offer?.enabled) return undefined;
  const image = await FirmwareImageModel.findOne({ deviceType, version: offer.version }).select('-data').lean();
  if (!image) return undefined;
  return {
    version: image.version,
    url: `${baseUrl}/api/firmware/${deviceType}/${image.version}.bin`,
    sha256: image.sha256,
  };
}
