// API urządzeń wspólne dla wszystkich rodzajów sterowników: /api/devices (lista, nazwa, domyślny)
// i /api/device/properties (ustawienia wybranego urządzenia). Używane przez App, stronę Devices,
// popup DeviceEditModal, Harmonogramy pompy oraz widoki hydroforu.
import { Requests, apiUrl } from './http';
import { Device, DeviceProperties, DeviceType, FirmwareSummary } from './types';

// Urządzenia wszystkich rodzajów: lista, nazwa, sterownik domyślny i ustawienia (properties).
export class DeviceRequests {
  // bez rootId/deviceId w zapytaniu: lista jest potrzebna, zanim cokolwiek wybrano;
  // przy błędzie zwraca null (Requests.get nie rzuca wyjątku)
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

  // properties wybranego urządzenia (rootId z kontekstu): pompa — tryb i temperatury domyślne
  // schedulera, hydrofor — czas kompresora, progi presostatu i zbiorniki
  static getDeviceProperties(): Promise<DeviceProperties> {
    return Requests.get('/device/properties') as Promise<DeviceProperties>;
  }

  static updateDeviceProperties(properties: DeviceProperties) {
    return Requests.put('/device/properties', properties) as Promise<DeviceProperties>;
  }
}

// Firmware sterowników przez sieć (OTA): bez rootId, bo dotyczy rodzaju sterownika, nie jednego
// urządzenia. Używane przez stronę /firmware.
export class FirmwareRequests {
  // przy błędzie zwraca null (Requests.get nie rzuca wyjątku)
  static get(type: DeviceType): Promise<FirmwareSummary | null> {
    return Requests.get(`/firmware/${type}`, false) as Promise<FirmwareSummary | null>;
  }

  // zapisuje plik i ustawia go jako oferowany; serwer liczy SHA-256 i sprawdza obraz ESP32
  static upload(type: DeviceType, version: string, file: Blob): Promise<FirmwareSummary> {
    return Requests.putFile(`/firmware/${type}/${encodeURIComponent(version)}`, file);
  }

  // włączenie i wyłączenie oferty albo przywrócenie wersji, której plik jest jeszcze w bazie
  static update(type: DeviceType, change: { enabled?: boolean; version?: string }): Promise<FirmwareSummary> {
    return Requests.put(`/firmware/${type}`, change, false) as Promise<FirmwareSummary>;
  }

  static fileUrl(type: DeviceType, version: string) {
    return apiUrl(`/firmware/${type}/${encodeURIComponent(version)}.bin`);
  }
}
