import type { ComponentType, ReactElement, ReactNode } from 'react';
import type { PumpWorkMode, WorkMode } from '../devices/heat-pump/types';

// Typy części wspólnej: urządzenie i jego ustawienia oraz opis rodzaju sterownika dla rejestru
// (device-types.tsx). Odpowiadają dokumentom kolekcji devices (GET /api/devices, /api/device/properties).

// Wartości deviceType z bazy; nowy rodzaj wymaga też wpisu w rejestrze device-types.tsx.
export enum DeviceType {
  HP = 'heat_pump',
  WATER_PRESSURE_TANK = 'water-pressure-tank',
  PELLET_BOILER_PELUX200 = 'pellet-boiler-pelux200',
  SWITCH = 'switch',
}

// Dni harmonogramu (pompa ciepła i włącznik); wartości ujemne to grupy dni, DAYS_OFF obejmuje
// weekendy i polskie święta (calendar.service na serwerze). Ten sam kontrakt na serwerze.
export enum WeekDay {
  ANY_DAY = -1,
  WORKDAYS = -2,
  DAYS_OFF = -3,
  SUNDAY = 0,
  MONDAY = 1,
  TUESDAY = 2,
  WEDNESDAY = 3,
  THURSDAY = 4,
  FRIDAY = 5,
  SATURDAY = 6,
}

// Ustawienia urządzenia (properties): jedno pole dla wszystkich rodzajów sterowników.
export type DeviceProperties = {
  // pompa ciepła: tryb pracy i temperatura od–do poza harmonogramem; M/A/CWU i pary co_*/cwu_*
  // to dawne ustawienia (do 2026-10-05), serwer czyta je, gdy brak nowych
  work_mode?: PumpWorkMode | WorkMode;
  temp_min?: string;
  temp_max?: string;
  co_min?: string;
  co_max?: string;
  cwu_min?: string;
  cwu_max?: string;
  // hydrofor
  compressor_seconds?: number;
  // kocioł pelletowy: co ile sterownik odpytuje piec, 30–3600 s (domyślnie 300)
  poll_interval_seconds?: number;
  // włącznik: domyślny czas „Włącz” [min], 0 (bez limitu) – 10080
  default_on_minutes?: number;
};

// rootId to _id dokumentu w MongoDB, deviceId to SN sterownika (MAC ESP32); pusta nazwa
// oznacza sterownik zarejestrowany automatycznie (w interfejsie deviceLabel pokazuje wtedy deviceId).
export type Device = {
  rootId: string;
  deviceType: DeviceType;
  deviceId: string;
  name: string;
  isDefault?: boolean;
  // wersja firmware zgłoszona przy ostatnim uruchomieniu sterownika i czas zgłoszenia (ISO);
  // starsze sterowniki ich nie wysyłają
  firmwareVersion?: string;
  firmwareSeenAt?: string;
  // zlecenie „Aktualizuj” czekające na sterownik; znika, gdy sterownik zgłosi oferowaną wersję
  firmwareUpdate?: FirmwareUpdateRequest;
  // adres IPv4 sterownika w sieci lokalnej z ostatniego zgłoszenia i czas zgłoszenia (ISO)
  ipAddress?: string;
  ipSeenAt?: string;
  // pompa ciepła: definicja z okna „Dane sterownika”; brak = jeszcze nie ustawiona
  pumpConfig?: PumpConfig;
  properties?: DeviceProperties;
};

// Definicja pompy ciepła (kontrakt z serwerem, core/types.ts): podłączenie, zbiornik i fotowoltaika.
export type PumpConnection = 'cwu' | 'co';
export type PumpConfig = {
  connection: PumpConnection;
  /** pojemność zbiornika [l], pełne litry 20–2000 */
  tankLiters: number;
  /** panele Hoymiles podłączone przez DTU (RS-485) */
  pvDtu: boolean;
  /** wymuszenie pracy przy produkcji PV > 2 kW; tylko z pvDtu */
  pvForce: boolean;
};

// Pola okna „Dane sterownika” poza nazwą (PUT /devices/:rootId), zależne od rodzaju.
export type DeviceDefinition = { pumpConfig?: PumpConfig };

// GET /api/devices/db-stats (stopka strony /devices): zajętość bazy (dane + indeksy) względem limitu
// planu Atlas M0 (512 MB) i odpowiedź bazy na ping; ok = false albo brak odpowiedzi = baza nie działa.
export type DatabaseStats = {
  ok: boolean;
  usedBytes: number;
  dataBytes: number;
  indexBytes: number;
  limitBytes: number;
  collections: number;
  documents: number;
  pingMs: number;
};

// Część okna „Dane sterownika” dla rodzaju sterownika: zmiany zgłasza przez onChange,
// a null blokuje zapis (pole z błędem, opis w komponencie).
export type DeviceDefinitionFieldsProps = {
  device: Device;
  onChange: (definition: DeviceDefinition | null) => void;
};

export type FirmwareUpdateRequest = { version: string; requestedAt: string };

// Stan firmware rodzaju sterownika (GET /api/firmware/:rodzaj): oferta i pliki w bazie
// (bieżący i jeden poprzedni).
export type FirmwareImage = {
  version: string;
  size: number;
  description: string;
  sha256: string;
  createdAt: string;
  active: boolean;
};

export type FirmwareSummary = {
  enabled: boolean;
  version: string | null;
  previousVersion: string | null;
  images: FirmwareImage[];
};

// Widok w menu: ścieżka, nazwa i ikona w nagłówku oraz strona.
export type DeviceView = {
  path: string;
  label: string;
  icon: ReactNode;
  element: ReactElement;
};

// Opis rodzaju sterownika w kliencie: ikona kafelka na liście urządzeń i widoki
// w kolejności menu (path '/' to strona główna). Każdy rodzaj podaje swój
// (devices/<rodzaj>/device-type.tsx), a core/device-types.tsx zbiera je w rejestr.
export type DeviceTypeView = {
  type: DeviceType;
  tileIcon: ReactNode;
  /** nazwa rodzaju w nagłówkach (np. strona firmware) */
  label?: string;
  /** sterownik aktualizuje firmware przez sieć: kafelek ma trybik prowadzący do /firmware/:deviceType */
  firmwareUpdates?: boolean;
  views: DeviceView[];
  /** dodatkowe pola okna „Dane sterownika” (np. konfiguracja pompy ciepła) */
  DefinitionFields?: ComponentType<DeviceDefinitionFieldsProps>;
  /** dodatkowe ścieżki poza menu (np. /hp jako strona główna pompy) */
  extraRoutes?: { path: string; element: ReactElement }[];
};
