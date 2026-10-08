// Kafelki sterowników dla strony /devices (GET /devices/summary): dla każdego urządzenia woła tile rodzaju
// z rejestru. Błąd jednego rodzaju nie psuje pozostałych (kafelek zostaje wtedy tylko z nazwą).
import { DeviceTile } from '../types';
import { listDevices } from './device.service';
import { getDeviceTypeModule } from '../device-types';

export async function getDeviceTiles(): Promise<Record<string, DeviceTile>> {
  const devices = await listDevices();
  const entries = await Promise.all(devices.map(async (device) => {
    const rootId = String(device._id);
    try {
      const tile = await getDeviceTypeModule(device.deviceType).tile?.(rootId, device);
      return tile ? [rootId, tile] as const : null;
    } catch (error) {
      console.error(`[tile] ${device.deviceType} ${rootId}:`, error);
      return null;
    }
  }));
  return Object.fromEntries(entries.filter((entry): entry is [string, DeviceTile] => entry !== null));
}
