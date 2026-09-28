import { DeviceType } from '../../core/devices/device.types';
import type { DeviceTypeModule } from '../../core/device-type-module';

// Pompa ciepła: ustawienia domyślne dostaje od schematu (work_mode = CWU),
// a operacje odbiera w odpowiedzi na /hp/add, nie przy zgłoszeniu.
export const heatPumpDeviceType: DeviceTypeModule = {
  type: DeviceType.HP,
};
