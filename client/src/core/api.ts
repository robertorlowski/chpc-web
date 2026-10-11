// API urządzeń wspólne dla wszystkich rodzajów sterowników: /api/devices (lista, nazwa, domyślny)
// i /api/device/properties (ustawienia wybranego urządzenia). Używane przez App, stronę Devices,
// popup DeviceEditModal, Harmonogramy pompy oraz widoki hydroforu.
import { Requests } from './http';
import { DatabaseStats, Device, DeviceDefinition, DeviceProperties, DeviceShare, DeviceTiles, DeviceType, FirmwareSummary, FirmwareUpdateRequest, OperationsDay, User } from './types';

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

  // kafelki sterowników {rootId: kafelek}; null przy błędzie (Requests.get nie rzuca wyjątku)
  static getDeviceTiles(): Promise<DeviceTiles | null> {
    return Requests.get('/devices/summary', false) as Promise<DeviceTiles | null>;
  }

  // kolejność kafelków (tryb „Zmień kolejność”): wszystkie Root ID w nowej kolejności; zwraca posortowaną listę
  static setDevicesOrder(rootIds: string[]): Promise<Device[]> {
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

// Konta użytkowników (/api/auth/*, 2026-10-11): logowanie kodem lub linkiem z maila, system, „Zapamiętaj 7 dni”,
// dane konta, zmiana e-maila, usunięcie konta. Błędy jako ApiError z komunikatem serwera.
type Session = { token: string; created: boolean; user: User };
export const AuthRequests = {
  start: (email: string) => Requests.json<{ email: string; resendAfterSeconds: number }>('POST', '/auth/start', { email }),
  verifyCode: (email: string, code: string) => Requests.json<Session>('POST', '/auth/verify', { email, code }),
  verifyLink: (token: string) => Requests.json<Session>('POST', '/auth/verify', { token }),
  system: (password: string) => Requests.json<Session>('POST', '/auth/system', { password }),
  remember: (remember: boolean) => Requests.json<{ remember: boolean }>('POST', '/auth/remember', { remember }),
  logout: () => Requests.json<null>('POST', '/auth/logout'),
  me: () => Requests.json<User>('GET', '/auth/me'),
  updateMe: (data: Partial<User>) => Requests.json<User>('PUT', '/auth/me', data),
  changeEmail: (email: string) => Requests.json<{ email: string }>('POST', '/auth/email-change', { email }),
  verifyEmail: (code: string) => Requests.json<User>('POST', '/auth/email-change/verify', { code }),
  deleteAccount: () => Requests.json<{ email: string; devices: number }>('POST', '/auth/delete'),
  confirmDelete: (token: string) => Requests.json<{ devices: number }>('POST', '/auth/delete/confirm', { token }),
};

// Udostępnianie sterownika (właściciel): osoby z dostępem i ich zakładki.
const sharesPath = (rootId: string) => `/devices/${encodeURIComponent(rootId)}/shares`;
export const ShareRequests = {
  list: (rootId: string) => Requests.json<DeviceShare[]>('GET', sharesPath(rootId)),
  add: (rootId: string, email: string, tabs: string[]) => Requests.json<DeviceShare>('POST', sharesPath(rootId), { email, tabs }),
  update: (rootId: string, id: string, tabs: string[]) => Requests.json<DeviceShare>('PUT', `${sharesPath(rootId)}/${id}`, { tabs }),
  remove: (rootId: string, id: string) => Requests.json<null>('DELETE', `${sharesPath(rootId)}/${id}`),
};

// Dziennik operacji wybranego sterownika z dnia (zakładka „Operacje”); null przy błędzie
export class OperationRequests {
  static getDay(date: string): Promise<OperationsDay | null> {
    return Requests.get(`/operations?date=${date}`) as Promise<OperationsDay | null>;
  }
}
