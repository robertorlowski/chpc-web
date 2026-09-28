import type { ReactElement, ReactNode } from 'react';
import type { WorkMode } from '../devices/heat-pump/types';
import type { WaterTank } from '../devices/water-pressure-tank/types';

// Typy części wspólnej: urządzenie i jego ustawienia.

export enum DeviceType {
  HP = 'heat_pump',
  WATER_PRESSURE_TANK = 'water-pressure-tank',
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
};

export type Device = {
  rootId: string;
  deviceType: DeviceType;
  deviceId: string;
  name: string;
  isDefault?: boolean;
  properties?: DeviceProperties;
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
  views: DeviceView[];
  /** dodatkowe ścieżki poza menu (np. /hp jako strona główna pompy) */
  extraRoutes?: { path: string; element: ReactElement }[];
};
