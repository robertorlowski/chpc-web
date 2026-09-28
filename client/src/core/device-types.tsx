import { DeviceType, DeviceTypeView } from './types';
import { heatPumpDeviceType } from '../devices/heat-pump/device-type';
import { waterPressureDeviceType } from '../devices/water-pressure-tank/device-type';

// Rejestr rodzajów sterowników w kliencie: menu, trasy i ikona kafelka.
// Nowy rodzaj: katalog devices/<rodzaj>/ z device-type.tsx, wpis tutaj i wartość w DeviceType.
const DEVICE_TYPES: Record<DeviceType, DeviceTypeView> = {
  [DeviceType.HP]: heatPumpDeviceType,
  [DeviceType.WATER_PRESSURE]: waterPressureDeviceType,
};

// Bez wybranego urządzenia (albo z nieznanym typem) obowiązuje pompa ciepła, jak dotąd.
export const getDeviceTypeView = (type?: DeviceType): DeviceTypeView =>
  (type && DEVICE_TYPES[type]) || DEVICE_TYPES[DeviceType.HP];

// Wszystkie ścieżki widoków wszystkich rodzajów (trasy aplikacji).
export const allDevicePaths = (): string[] => {
  const paths = Object.values(DEVICE_TYPES).flatMap((view) => [
    ...view.views.map((item) => item.path),
    ...(view.extraRoutes ?? []).map((route) => route.path),
  ]);
  return [...new Set(paths)];
};
