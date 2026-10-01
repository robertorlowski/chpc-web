import type { ScheduleEntry, SettingsEntry, WorkMode } from '../modules/heat-pump/types';
import type { WaterTank } from '../modules/water-pressure-tank/types';

// Typy części wspólnej: urządzenie, jego ustawienia i opis rodzaju sterownika.

// Wartości są zapisane w bazie (devices.deviceType, rekordy danych) i wysyłane
// przez sterowniki przy zgłoszeniu; zmiana wymaga migracji i firmware.
export enum DeviceType {
  HP = 'heat_pump',
  WATER_PRESSURE_TANK = 'water-pressure-tank',
  PELLET_BOILER_PELUX200 = 'pellet-boiler-pelux200',
}

// Ustawienia urządzenia (pole properties). Jedno pole w bazie dla wszystkich
// rodzajów sterowników; każdy rodzaj używa swojej części.
export interface DeviceProperties {
  // pompa ciepła: wartości domyślne operacji (scheduler, getDefaultOperation);
  // temperatury jako napisy, bo tak idą do sterownika w operacji
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
  // kocioł pelletowy Pellux 200: odstęp odpytywania regulatora [s], 30–3600
  poll_interval_seconds?: number;
}

export interface Device {
  deviceType: DeviceType;
  deviceId: string;
  name?: string;
  /** sterownik otwierany po starcie aplikacji; najwyżej jeden */
  isDefault?: boolean;
  /** wersja firmware zgłoszona przez sterownik przy ostatnim zgłoszeniu (pole version) i kiedy */
  firmwareVersion?: string;
  firmwareSeenAt?: Date;
  // pompa ciepła: starsze ustawienia czasowe i harmonogramy
  settings?: SettingsEntry;
  schedules?: ScheduleEntry[];
  properties?: DeviceProperties;
}

// Opis rodzaju sterownika: to, czym rodzaje różnią się w części wspólnej
// (urządzenia i zgłoszenie). Każdy moduł podaje swój (device-type.ts), a
// core/device-types.ts zbiera je w rejestr.
export interface DeviceTypeModule {
  type: DeviceType;
  /** ustawienia (properties) nowego urządzenia utworzonego przy zgłoszeniu */
  initialProperties?: DeviceProperties;
  /** ustawienia odsyłane sterownikowi w odpowiedzi na zgłoszenie (pole settings) */
  controllerSettings?: (properties: DeviceProperties) => unknown;
  /** sterownik aktualizuje firmware przez sieć: odpowiedź na zgłoszenie niesie settings.firmware (core/services/firmware.service.ts) */
  firmwareUpdates?: boolean;
}
