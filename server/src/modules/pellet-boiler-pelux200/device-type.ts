// Opis rodzaju „kocioł pelletowy Pellux 200” dla rejestru core/device-types.ts:
// ustawienia nowego urządzenia i ustawienia odsyłane sterownikowi przy zgłoszeniu.
import { DeviceProperties, DeviceType, DeviceTypeModule } from '../../core/types';

// Co 5 minut; zakres 30–3600 s pilnuje schemat properties (core/models/device.model.ts).
export const DEFAULT_PELLET_BOILER_PELUX200_PROPERTIES: DeviceProperties = {
  poll_interval_seconds: 300,
};

export const pelletBoilerPelux200DeviceType: DeviceTypeModule = {
  type: DeviceType.PELLET_BOILER_PELUX200,
  initialProperties: DEFAULT_PELLET_BOILER_PELUX200_PROPERTIES,
  controllerSettings: (properties) => ({
    poll_interval_seconds: properties.poll_interval_seconds ?? 300,
  }),
};
