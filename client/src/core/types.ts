import type { ReactElement, ReactNode } from 'react';
import type { WorkMode } from '../devices/heat-pump/types';
import type { WaterTank } from '../devices/water-pressure-tank/types';

// Typy części wspólnej: urządzenie i jego ustawienia oraz opis rodzaju sterownika dla rejestru
// (device-types.tsx). Odpowiadają dokumentom kolekcji devices (GET /api/devices, /api/device/properties).

// Wartości deviceType z bazy; nowy rodzaj wymaga też wpisu w rejestrze device-types.tsx.
export enum DeviceType {
  HP = 'heat_pump',
  WATER_PRESSURE_TANK = 'water-pressure-tank',
  PELLET_BOILER_PELUX200 = 'pellet-boiler-pelux200',
}

// Ustawienia urządzenia (properties): jedno pole dla wszystkich rodzajów sterowników.
export type DeviceProperties = {
  // pompa ciepła
  co_min?: string;
  co_max?: string;
  cwu_min?: string;
  cwu_max?: string;
  work_mode?: WorkMode;
  // hydrofor
  compressor_seconds?: number;
  pressure_low?: number;
  pressure_high?: number;
  tanks?: WaterTank[];
  // kocioł pelletowy: co ile sterownik odpytuje piec, 30–3600 s (domyślnie 300)
  poll_interval_seconds?: number;
};

// rootId to _id dokumentu w MongoDB, deviceId to SN sterownika (MAC ESP32); pusta nazwa
// oznacza sterownik zarejestrowany automatycznie (w interfejsie deviceLabel pokazuje wtedy deviceId).
export type Device = {
  rootId: string;
  deviceType: DeviceType;
  deviceId: string;
  name: string;
  isDefault?: boolean;
  // wersja firmware zgłoszona przy ostatnim uruchomieniu sterownika i czas zgłoszenia (ISO);
  // starsze sterowniki ich nie wysyłają
  firmwareVersion?: string;
  firmwareSeenAt?: string;
  // adres IPv4 sterownika w sieci lokalnej z ostatniego zgłoszenia i czas zgłoszenia (ISO)
  ipAddress?: string;
  ipSeenAt?: string;
  properties?: DeviceProperties;
};

// Stan firmware rodzaju sterownika (GET /api/firmware/:rodzaj): oferta i pliki w bazie
// (bieżący i jeden poprzedni).
export type FirmwareImage = {
  version: string;
  size: number;
  description: string;
  sha256: string;
  createdAt: string;
  active: boolean;
};

export type FirmwareSummary = {
  enabled: boolean;
  version: string | null;
  previousVersion: string | null;
  images: FirmwareImage[];
};

// Widok w menu: ścieżka, nazwa i ikona w nagłówku oraz strona.
export type DeviceView = {
  path: string;
  label: string;
  icon: ReactNode;
  element: ReactElement;
};

// Opis rodzaju sterownika w kliencie: ikona kafelka na liście urządzeń i widoki
// w kolejności menu (path '/' to strona główna). Każdy rodzaj podaje swój
// (devices/<rodzaj>/device-type.tsx), a core/device-types.tsx zbiera je w rejestr.
export type DeviceTypeView = {
  type: DeviceType;
  tileIcon: ReactNode;
  /** nazwa rodzaju w nagłówkach (np. strona firmware) */
  label?: string;
  /** sterownik aktualizuje firmware przez sieć: kafelek ma trybik prowadzący do /firmware/:deviceType */
  firmwareUpdates?: boolean;
  views: DeviceView[];
  /** dodatkowe ścieżki poza menu (np. /hp jako strona główna pompy) */
  extraRoutes?: { path: string; element: ReactElement }[];
};
