// Opis rodzaju „włącznik” (switch) dla rejestru core/device-types.ts: ustawienia
// nowego urządzenia, ustawienia odsyłane przy zgłoszeniu, OTA i liczba przekaźników.
import { DeviceProperties, DeviceType, DeviceTypeModule } from '../../core/types';
import { ensureRelays, isRelayCount } from './services/switch.service';

export const DEFAULT_SWITCH_PROPERTIES: DeviceProperties = {
  default_on_minutes: 30,
};

// Zgłoszenie niesie relays (liczba przekaźników płytki); przekaźniki powstają od razu,
// żeby aplikacja pokazała je przed pierwszym zgłoszeniem stanu.
export const switchDeviceType: DeviceTypeModule = {
  type: DeviceType.SWITCH,
  initialProperties: DEFAULT_SWITCH_PROPERTIES,
  firmwareUpdates: true,
  controllerSettings: (properties) => ({
    default_on_minutes: properties.default_on_minutes ?? 30,
  }),
  onRegister: async (rootId, deviceId, body) => {
    if (isRelayCount(body.relays)) await ensureRelays(rootId, deviceId, body.relays);
  },
};
