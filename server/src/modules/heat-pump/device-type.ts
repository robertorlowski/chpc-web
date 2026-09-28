import { DeviceType, DeviceTypeModule } from '../../core/types';

// Opis rodzaju „pompa ciepła” (heat_pump) dla rejestru core/device-types.ts.
// Pompa ciepła: ustawienia domyślne dostaje od schematu (work_mode = CWU),
// a operacje odbiera w odpowiedzi na /hp/add, nie przy zgłoszeniu.
export const heatPumpDeviceType: DeviceTypeModule = {
  type: DeviceType.HP,
};
