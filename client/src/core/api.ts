// API urządzeń wspólne dla wszystkich rodzajów sterowników: /api/devices (lista, nazwa, domyślny)
// i /api/device/properties (ustawienia wybranego urządzenia). Używane przez App, stronę Devices,
// popup DeviceEditModal, Harmonogramy pompy oraz widoki hydroforu.
import { Requests } from './http';
import { DatabaseStats, Device, DeviceDefinition, DeviceProperties, DeviceTiles, DeviceType, FirmwareSummary, FirmwareUpdateRequest, OperationsDay, OutdoorConditions, WeatherTile } from './types';

// Urządzenia wszystkich rodzajów: lista, nazwa, sterownik domyślny i ustawienia (properties).
export class DeviceRequests {
  // bez rootId/deviceId w zapytaniu: lista jest potrzebna, zanim cokolwiek wybrano;
  // przy błędzie zwraca null (Requests.get nie rzuca wyjątku)
  static getDevices(): Promise<Device[]> {
    return Requests.get('/devices', false) as Promise<Device[]>;
  }

  // zajętość bazy dla stopki strony /devices; null przy błędzie (np. 503 bez połączenia z bazą)
  static getDatabaseStats(): Promise<DatabaseStats | null> {
    return Requests.get('/devices/db-stats', false) as Promise<DatabaseStats | null>;
  }

  // okno „Dane sterownika”: nazwa i pola rodzaju (definicja pompy); rootId w ścieżce,
  // bo na liście urządzeń żadne nie jest jeszcze wybrane
  static updateDevice(rootId: string, data: { name: string } & DeviceDefinition): Promise<Device> {
    return Requests.put(`/devices/${encodeURIComponent(rootId)}`, data, false) as Promise<Device>;
  }

  // ukrycie / pokazanie kafelka sterownika (tryb „Zmień kolejność”)
  static setDeviceHidden(rootId: string, hidden: boolean): Promise<Device> {
    return Requests.put(`/devices/${encodeURIComponent(rootId)}`, { hidden }, false) as Promise<Device>;
  }

  // temperatura z czujnika kotła i pogoda z Open-Meteo nad kafelkami (null w polach bez świeżych danych); null przy błędzie
  static getOutdoorConditions(): Promise<OutdoorConditions | null> {
    return Requests.get('/temperature', false) as Promise<OutdoorConditions | null>;
  }

  // kafelki sterowników {rootId: kafelek}; null przy błędzie (Requests.get nie rzuca wyjątku)
  static getDeviceTiles(): Promise<DeviceTiles | null> {
    return Requests.get('/devices/summary', false) as Promise<DeviceTiles | null>;
  }

  // wzór kafelka (projektant kafelka): zapisany wzór, null = wbudowany, undefined przy błędzie sieci
  static async getTileTemplate(): Promise<unknown | null | undefined> {
    const result = await Requests.get('/devices/tile-template', false) as { template: unknown } | null;
    return result ? result.template : undefined;
  }

  static saveTileTemplate(template: unknown): Promise<{ template: unknown }> {
    return Requests.put('/devices/tile-template', template, false) as Promise<{ template: unknown }>;
  }

  // układ szachownicy (tryb „Zmień układ”): pola po kolei z Root ID sterownika, id kafelka pogody albo null
  // (puste pole); zwraca posortowaną listę sterowników
  static setDevicesOrder(rootIds: (string | null)[]): Promise<Device[]> {
    return Requests.put('/devices/order', { rootIds }, false) as Promise<Device[]>;
  }

  // sterownik otwierany po starcie aplikacji; w bazie najwyżej jeden
  static setDefaultDevice(rootId: string, isDefault: boolean): Promise<Device> {
    return Requests.put(`/devices/${encodeURIComponent(rootId)}/default`, { isDefault }, false) as Promise<Device>;
  }

  // przycisk „Aktualizuj”: zlecenie aktualizacji firmware do oferowanej wersji (i jego odwołanie);
  // bez zlecenia sterownik niczego nie pobiera. Rzuca wyjątek z komunikatem serwera.
  static requestFirmwareUpdate(rootId: string): Promise<FirmwareUpdateRequest> {
    return Requests.postJson(`/devices/${encodeURIComponent(rootId)}/firmware-update`);
  }

  static cancelFirmwareUpdate(rootId: string): Promise<void> {
    return Requests.deleteJson(`/devices/${encodeURIComponent(rootId)}/firmware-update`);
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
  static upload(type: DeviceType, version: string, file: Blob, description = ''): Promise<FirmwareSummary> {
    const query = description ? `?description=${encodeURIComponent(description)}` : '';
    return Requests.putFile(`/firmware/${type}/${encodeURIComponent(version)}${query}`, file);
  }

  // usuwa plik wersji, która nie jest oferowana
  static remove(type: DeviceType, version: string): Promise<FirmwareSummary> {
    return Requests.deleteJson(`/firmware/${type}/${encodeURIComponent(version)}`);
  }

  // włączenie i wyłączenie oferty albo przywrócenie wersji, której plik jest jeszcze w bazie
  static update(type: DeviceType, change: { enabled?: boolean; version?: string }): Promise<FirmwareSummary> {
    return Requests.put(`/firmware/${type}`, change, false) as Promise<FirmwareSummary>;
  }
}

// Dziennik operacji wybranego sterownika z dnia (zakładka „Operacje”); null przy błędzie
export class OperationRequests {
  static getDay(date: string): Promise<OperationsDay | null> {
    return Requests.get(`/operations?date=${date}`) as Promise<OperationsDay | null>;
  }
}

// Kafelki pogody na liście sterowników (bez rootId); kolejność razem ze sterownikami w DeviceRequests.setDevicesOrder.
export class WeatherTileRequests {
  static list(): Promise<WeatherTile[] | null> {
    return Requests.get('/weather-tiles', false) as Promise<WeatherTile[] | null>;
  }

  static create(data: { name: string; lat: number; lon: number }): Promise<WeatherTile> {
    return Requests.put('/weather-tiles', data, false, 'POST') as Promise<WeatherTile>;
  }

  static update(id: string, data: Partial<{ name: string; lat: number; lon: number; hidden: boolean }>): Promise<WeatherTile> {
    return Requests.put(`/weather-tiles/${encodeURIComponent(id)}`, data, false) as Promise<WeatherTile>;
  }

  static remove(id: string): Promise<void> {
    return Requests.delete(`/weather-tiles/${encodeURIComponent(id)}`, false);
  }
}
