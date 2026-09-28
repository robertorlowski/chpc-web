import { DeviceType } from './devices/device.types';
import { DeviceModel } from './devices/device.model';

export interface DeviceInfo {
  deviceType: DeviceType;
  deviceId: string;
}

// Typ i deviceId urządzenia dopisywane do rekordów danych każdego sterownika.
// Trzymane w pamięci do restartu serwera: po zmianie deviceId w bazie trzeba
// zrestartować serwer albo wywołać forgetDeviceInfo.
const deviceInfoByRoot = new Map<string, DeviceInfo>();

export const getDeviceInfo = async (rootId: string): Promise<DeviceInfo> => {
  const cached = deviceInfoByRoot.get(rootId);
  if (cached) return cached;

  const device = await DeviceModel
    .findById(rootId)
    .select('deviceType deviceId')
    .lean();

  if (!device) {
    throw new Error(`Device not found: ${rootId}`);
  }

  const info = {
    deviceType: device.deviceType,
    deviceId: device.deviceId,
  };
  deviceInfoByRoot.set(rootId, info);
  return info;
};

export const forgetDeviceInfo = (rootId: string) => {
  deviceInfoByRoot.delete(rootId);
};
