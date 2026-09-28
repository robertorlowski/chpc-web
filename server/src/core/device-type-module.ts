import type { DeviceProperties, DeviceType } from './devices/device.types';

// Opis rodzaju sterownika: to, czym rodzaje różnią się w części wspólnej
// (urządzenia i zgłoszenie). Każdy moduł podaje swój, a core/device-types.ts
// zbiera je w rejestr.
export interface DeviceTypeModule {
  type: DeviceType;
  /** ustawienia (properties) nowego urządzenia utworzonego przy zgłoszeniu */
  initialProperties?: DeviceProperties;
  /** ustawienia odsyłane sterownikowi w odpowiedzi na zgłoszenie (pole settings) */
  controllerSettings?: (properties: DeviceProperties) => unknown;
}
