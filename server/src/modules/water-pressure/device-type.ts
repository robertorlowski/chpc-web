import { DeviceProperties, DeviceType } from '../../core/devices/device.types';
import type { DeviceTypeModule } from '../../core/device-type-module';

// Ustawienia nowego hydroforu: dwa zbiorniki po 300 l jak w instalacji użytkownika,
// progi presostatu i p0 do poprawienia w Ustawieniach po odczycie z manometru.
export const DEFAULT_WATER_PRESSURE_PROPERTIES: DeviceProperties = {
  compressor_seconds: 30,
  pressure_low: 2,
  pressure_high: 4,
  tanks: [
    { name: 'Ocynkowany', kind: 'air', volumeLiters: 300, enabled: true, k: 1 },
    { name: 'Przeponowy', kind: 'membrane', volumeLiters: 300, enabled: true, precharge: 1.8 },
  ],
};

// Hydrofor pobiera ustawienia raz na start, z odpowiedzi na zgłoszenie.
export const waterPressureDeviceType: DeviceTypeModule = {
  type: DeviceType.WATER_PRESSURE,
  initialProperties: DEFAULT_WATER_PRESSURE_PROPERTIES,
  controllerSettings: (properties) => ({
    compressor_seconds: properties.compressor_seconds,
    pressure_low: properties.pressure_low,
    pressure_high: properties.pressure_high,
    tanks: properties.tanks ?? [],
  }),
};
