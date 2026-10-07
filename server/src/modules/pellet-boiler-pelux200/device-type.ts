// Opis rodzaju „kocioł pelletowy Pellux 200” dla rejestru core/device-types.ts:
// ustawienia nowego urządzenia i ustawienia odsyłane sterownikowi przy zgłoszeniu.
import { DeviceProperties, DeviceType, DeviceTypeModule } from '../../core/types';
import { checkBoilerDefinition, initBoilerDefinition } from './services/pellet-boiler-pelux200-heat-pump-link.service';

// Co minutę (od 2026-10-05, cykl Zimy w trybie pompy ciepła reaguje na temperaturę kotła; wcześniej 5 min);
// zakres 30–3600 s pilnuje schemat properties (core/models/device.model.ts).
export const DEFAULT_POLL_INTERVAL_SECONDS = 60;
export const DEFAULT_PELLET_BOILER_PELUX200_PROPERTIES: DeviceProperties = {
  poll_interval_seconds: DEFAULT_POLL_INTERVAL_SECONDS,
};

export const pelletBoilerPelux200DeviceType: DeviceTypeModule = {
  type: DeviceType.PELLET_BOILER_PELUX200,
  initialProperties: DEFAULT_PELLET_BOILER_PELUX200_PROPERTIES,
  controllerSettings: (properties) => ({
    poll_interval_seconds: properties.poll_interval_seconds ?? DEFAULT_POLL_INTERVAL_SECONDS,
  }),
  // OTA na zlecenie („Aktualizuj”); oferta idzie też w odpowiedzi GET …/commands/next (od firmware 1.5.0)
  firmwareUpdates: true,
  // powiązanie z pompą ciepła (heat-pump-link.service): nowy kocioł bez pompy, odłączenie tylko w trybie Pellet
  onRegister: (rootId) => initBoilerDefinition(rootId),
  checkDefinition: checkBoilerDefinition,
};
