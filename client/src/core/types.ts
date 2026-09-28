import type { WorkMode } from '../devices/heat-pump/types';
import type { WaterTank } from '../devices/water-pressure/types';

// Typy części wspólnej: urządzenie i jego ustawienia.

export enum DeviceType {
  HP = 'heat_pump',
  WATER_PRESSURE = 'water-pressure',
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
