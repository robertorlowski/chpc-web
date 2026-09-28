import { DeviceType } from './devices/device.types';
import type { DeviceTypeModule } from './device-type-module';
import { heatPumpDeviceType } from '../modules/heat-pump/device-type';
import { waterPressureDeviceType } from '../modules/water-pressure/device-type';

// Rejestr rodzajów sterowników. Nowy rodzaj: moduł w modules/, jego
// device-type.ts tutaj, trasy w core/routes.ts i wartość w DeviceType.
const DEVICE_TYPES: Record<DeviceType, DeviceTypeModule> = {
  [DeviceType.HP]: heatPumpDeviceType,
  [DeviceType.WATER_PRESSURE]: waterPressureDeviceType,
};

export const getDeviceTypeModule = (type: DeviceType): DeviceTypeModule => DEVICE_TYPES[type];
