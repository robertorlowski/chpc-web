import { DeviceType, DeviceTypeView } from './types';
import { heatPumpDeviceType } from '../devices/heat-pump/device-type';
import { waterPressureTankDeviceType } from '../devices/water-pressure-tank/device-type';
import { pelletBoilerDeviceType } from '../devices/pellet-boiler-pelux200/device-type';
import { switchDeviceType } from '../devices/switch/device-type';
import { photovoltaicDeviceType } from '../devices/photovoltaic/device-type';

// Rejestr rodzajów sterowników w kliencie: menu, trasy i ikona kafelka.
// Nowy rodzaj: katalog devices/<rodzaj>/ z device-type.tsx, wpis tutaj i wartość w DeviceType.
// Korzystają z niego App.tsx (trasy), Header (menu) i strona Devices (ikona kafelka).
// Klucz to deviceType z bazy; odpowiednik na serwerze: server/src/core/device-types.ts.
const DEVICE_TYPES: Record<DeviceType, DeviceTypeView> = {
  [DeviceType.HP]: heatPumpDeviceType,
  [DeviceType.WATER_PRESSURE_TANK]: waterPressureTankDeviceType,
  [DeviceType.PELLET_BOILER_PELUX200]: pelletBoilerDeviceType,
  [DeviceType.SWITCH]: switchDeviceType,
  [DeviceType.PHOTOVOLTAIC]: photovoltaicDeviceType,
};

// Bez wybranego urządzenia (albo z nieznanym typem) obowiązuje pompa ciepła, jak dotąd.
export const getDeviceTypeView = (type?: DeviceType): DeviceTypeView =>
  (type && DEVICE_TYPES[type]) || DEVICE_TYPES[DeviceType.HP];

// Wszystkie ścieżki widoków wszystkich rodzajów (trasy aplikacji). Ta sama ścieżka (np. /data)
// występuje raz; widok dla wybranego sterownika wybiera DeviceRoute w App.tsx.
export const allDevicePaths = (): string[] => {
  const paths = Object.values(DEVICE_TYPES).flatMap((view) => [
    ...view.views.map((item) => item.path),
    ...(view.extraRoutes ?? []).map((route) => route.path),
  ]);
  return [...new Set(paths)];
};
