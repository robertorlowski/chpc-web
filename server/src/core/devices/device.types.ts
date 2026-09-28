import type { ScheduleEntry, SettingsEntry, WorkMode } from '../../modules/heat-pump/types';
import type { WaterTank } from '../../modules/water-pressure/types';

export enum DeviceType {
  HP = 'heat_pump',
  WATER_PRESSURE = 'water-pressure',
}

// Ustawienia urządzenia (pole properties). Jedno pole w bazie dla wszystkich
// rodzajów sterowników; każdy rodzaj używa swojej części.
export interface DeviceProperties {
  // pompa ciepła
  co_min?: String;
  co_max?: String;
  cwu_min?: String;
  cwu_max?: String;
  work_mode?: WorkMode;
  // hydrofor
  compressor_seconds?: number;
  /** progi presostatu [bar na manometrze] */
  pressure_low?: number;
  pressure_high?: number;
  tanks?: WaterTank[];
}

export interface Device {
  deviceType: DeviceType;
  deviceId: string;
  name?: string;
  /** sterownik otwierany po starcie aplikacji; najwyżej jeden */
  isDefault?: boolean;
  // pompa ciepła: starsze ustawienia czasowe i harmonogramy
  settings?: SettingsEntry;
  schedules?: ScheduleEntry[];
  properties?: DeviceProperties;
}
