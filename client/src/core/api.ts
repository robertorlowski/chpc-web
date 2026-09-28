import { Requests } from './http';
import { Device, DeviceProperties } from './types';

// Urządzenia wszystkich rodzajów: lista, nazwa, sterownik domyślny i ustawienia (properties).
export class DeviceRequests {
  static getDevices(): Promise<Device[]> {
    return Requests.get('/devices', false) as Promise<Device[]>;
  }

  // rootId w ścieżce: na liście urządzeń żadne nie jest jeszcze wybrane
  static updateDeviceName(rootId: string, name: string): Promise<Device> {
    return Requests.put(`/devices/${encodeURIComponent(rootId)}`, { name }, false) as Promise<Device>;
  }

  // sterownik otwierany po starcie aplikacji; w bazie najwyżej jeden
  static setDefaultDevice(rootId: string, isDefault: boolean): Promise<Device> {
    return Requests.put(`/devices/${encodeURIComponent(rootId)}/default`, { isDefault }, false) as Promise<Device>;
  }

  static getDeviceProperties(): Promise<DeviceProperties> {
    return Requests.get('/device/properties') as Promise<DeviceProperties>;
  }

  static updateDeviceProperties(properties: DeviceProperties) {
    return Requests.put('/device/properties', properties) as Promise<DeviceProperties>;
  }
}
