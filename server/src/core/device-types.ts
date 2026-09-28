// Rejestr rodzajów sterowników dla części wspólnej: zgłoszenie (device.service,
// device.controller) bierze stąd ustawienia startowe i ustawienia dla sterownika.
import { DeviceType, DeviceTypeModule } from './types';
import { heatPumpDeviceType } from '../modules/heat-pump/device-type';
import { waterPressureTankDeviceType } from '../modules/water-pressure-tank/device-type';

// Rejestr rodzajów sterowników. Nowy rodzaj: moduł w modules/, jego
// device-type.ts tutaj, trasy w core/routes.ts i wartość w DeviceType.
const DEVICE_TYPES: Record<DeviceType, DeviceTypeModule> = {
  [DeviceType.HP]: heatPumpDeviceType,
  [DeviceType.WATER_PRESSURE_TANK]: waterPressureTankDeviceType,
};

export const getDeviceTypeModule = (type: DeviceType): DeviceTypeModule => DEVICE_TYPES[type];
