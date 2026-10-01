// Opis rodzaju „hydrofor” (water-pressure-tank) dla rejestru core/device-types.ts:
// ustawienia nowego urządzenia i ustawienia odsyłane sterownikowi przy zgłoszeniu.
import { DeviceProperties, DeviceType, DeviceTypeModule } from '../../core/types';

// Ustawienia nowego hydroforu: dwa zbiorniki po 300 l jak w instalacji użytkownika,
// progi presostatu i p0 do poprawienia w Ustawieniach po odczycie z manometru.
export const DEFAULT_WATER_PRESSURE_TANK_PROPERTIES: DeviceProperties = {
  compressor_seconds: 30,
  pressure_low: 2,
  pressure_high: 4,
  tanks: [
    { name: 'Ocynkowany', kind: 'air', volumeLiters: 300, enabled: true, k: 1 },
    { name: 'Przeponowy', kind: 'membrane', volumeLiters: 300, enabled: true, precharge: 1.8 },
  ],
};

// Hydrofor pobiera ustawienia raz na start, z odpowiedzi na zgłoszenie. Sterownik
// ma zasilanie tylko w czasie pracy pompy, więc zmiana w aplikacji działa od
// następnego uruchomienia. Format settings musi odpowiadać parseSettings w firmware
// (devices/water-pressure-tank/src/settings.cpp).
export const waterPressureTankDeviceType: DeviceTypeModule = {
  type: DeviceType.WATER_PRESSURE_TANK,
  initialProperties: DEFAULT_WATER_PRESSURE_TANK_PROPERTIES,
  // oferta firmware (wersja, adres, SHA-256) jest dopisywana do settings przy zgłoszeniu
  firmwareUpdates: true,
  controllerSettings: (properties) => ({
    compressor_seconds: properties.compressor_seconds,
    pressure_low: properties.pressure_low,
    pressure_high: properties.pressure_high,
    tanks: properties.tanks ?? [],
  }),
};
