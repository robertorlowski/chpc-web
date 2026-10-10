import type { PumpWorkMode, ScheduleEntry, SettingsEntry, WorkMode } from '../modules/heat-pump/types';

// Typy części wspólnej: urządzenie, jego ustawienia i opis rodzaju sterownika.

// Wartości są zapisane w bazie (devices.deviceType, rekordy danych) i wysyłane
// przez sterowniki przy zgłoszeniu; zmiana wymaga migracji i firmware.
export enum DeviceType {
  HP = 'heat_pump',
  WATER_PRESSURE_TANK = 'water-pressure-tank',
  PELLET_BOILER_PELUX200 = 'pellet-boiler-pelux200',
  SWITCH = 'switch',
  // instalacja PV (DTU Hoymiles czytane przez sterownik co); urządzenie zakłada serwer
  PHOTOVOLTAIC = 'photovoltaic',
}

// Dni harmonogramu (pompa ciepła i włącznik); ten sam kontrakt w kliencie (zmieniać razem).
// WORKDAYS pomija święta, DAYS_OFF obejmuje weekendy i polskie święta
// (core/services/calendar.service.ts).
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

// Ustawienia urządzenia (pole properties). Jedno pole w bazie dla wszystkich
// rodzajów sterowników; każdy rodzaj używa swojej części.
export interface DeviceProperties {
  // pompa ciepła: tryb pracy (ręczny / automatyczny / OFF) i temperatura od–do poza harmonogramem
  // (scheduler, pump-mode.service.ts); temperatury jako napisy, bo tak idą do sterownika w operacji.
  // co_* i cwu_* oraz work_mode M/A/CWU to dawne ustawienia (do 2026-10-05), czytane, gdy brak nowych.
  work_mode?: PumpWorkMode | WorkMode;
  temp_min?: String;
  temp_max?: String;
  co_min?: String;
  co_max?: String;
  cwu_min?: String;
  cwu_max?: String;
  // hydrofor
  compressor_seconds?: number;
  // kocioł pelletowy Pellux 200: odstęp odpytywania regulatora [s], 30–3600
  poll_interval_seconds?: number;
  // włącznik: domyślny czas „Włącz” [min] (0 = bez limitu), podpowiadany w aplikacji i na stronie sterownika
  default_on_minutes?: number;
}

// Definicja pompy ciepła (okno „Dane sterownika”), ustawiana raz przy montażu; nie zmienia trybu
// pracy ani temperatur. Osobne pole urządzenia, bo PUT /device/properties zastępuje całe properties.
export type PumpConnection = 'cwu' | 'co';
export interface PumpConfig {
  /** cwu: pompa grzeje zasobnik CWU; co: bufor CO albo wodę w piecu */
  connection: PumpConnection;
  /** pojemność zbiornika [l] (COP zbiornika w co); brak = jeszcze nie wpisana (serwer podaje co domyślne 300 l) */
  tankLiters?: number;
  /** panele Hoymiles podłączone przez DTU (RS-485 sterownika co) */
  pvDtu: boolean;
  /** wymuszenie pracy przy produkcji PV > 2 kW; tylko z pvDtu */
  pvForce: boolean;
}

// Definicja kotła pelletowego (okno „Dane sterownika”): pompa ciepła, z którą kocioł pracuje w trybie
// „Pompa ciepła”. null = bez pompy ciepła: kocioł pracuje tylko na pellecie, aplikacja nie pokazuje trybu pracy.
export interface BoilerConfig {
  heatPumpRootId: string | null;
}

// Zapis definicji odrzucony przez moduł rodzaju (np. usunięcie pompy ciepła przy trybie „Pompa ciepła”): 409.
export class DefinitionConflictError extends Error {}

export interface Device {
  deviceType: DeviceType;
  deviceId: string;
  name?: string;
  /** sterownik otwierany po starcie aplikacji; najwyżej jeden */
  isDefault?: boolean;
  /** miejsce na liście sterowników (0 = pierwszy); brak = na końcu */
  sortOrder?: number;
  /** wersja firmware zgłoszona przez sterownik przy ostatnim zgłoszeniu (pole version) i kiedy */
  firmwareVersion?: string;
  firmwareSeenAt?: Date;
  /** zlecenie aktualizacji z aplikacji (wersja, kiedy); oferta idzie do sterownika tylko przy nim */
  firmwareUpdate?: { version: string; requestedAt: Date };
  /** adres IPv4 sterownika w sieci lokalnej z ostatniego zgłoszenia (pole ip) i kiedy */
  ipAddress?: string;
  ipSeenAt?: Date;
  /** pompa ciepła: podłączenie, zbiornik i fotowoltaika; brak = jeszcze nie ustawione (PUMP_CONFIG_DEFAULTS) */
  pumpConfig?: PumpConfig;
  /** kocioł pelletowy: powiązana pompa ciepła; brak pola = jeszcze nie ustawione (uzupełniane przy starcie serwera) */
  boilerConfig?: BoilerConfig;
  // pompa ciepła: starsze ustawienia czasowe i harmonogramy
  settings?: SettingsEntry;
  schedules?: ScheduleEntry[];
  properties?: DeviceProperties;
}

// Opis rodzaju sterownika: to, czym rodzaje różnią się w części wspólnej
// (urządzenia i zgłoszenie). Każdy moduł podaje swój (device-type.ts), a
// core/device-types.ts zbiera je w rejestr.
export interface DeviceTypeModule {
  type: DeviceType;
  /** ustawienia (properties) nowego urządzenia utworzonego przy zgłoszeniu */
  initialProperties?: DeviceProperties;
  /** ustawienia odsyłane sterownikowi w odpowiedzi na zgłoszenie (pole settings) */
  controllerSettings?: (properties: DeviceProperties, device: Device) => unknown;
  /** sterownik aktualizuje firmware przez sieć, na zlecenie z aplikacji: odpowiedź na zgłoszenie (i odpowiedzi
   * włącznika i pieca) niesie wtedy ofertę firmware (core/services/firmware.service.ts) */
  firmwareUpdates?: boolean;
  /** dodatkowe pola zgłoszenia (np. liczba przekaźników włącznika); wołane przy każdym zgłoszeniu */
  onRegister?: (rootId: string, deviceId: string, body: Record<string, unknown>) => Promise<void>;
  /** wołane po zapisie ustawień urządzenia (PUT /device/properties), np. pompa kasuje ręczne nadpisania */
  onPropertiesSaved?: (rootId: string) => Promise<void>;
  /** sprawdzenie definicji przed zapisem (okno „Dane sterownika”); DefinitionConflictError = 409 */
  checkDefinition?: (rootId: string, definition: { boilerConfig?: BoilerConfig }) => Promise<void>;
  /** definicja pompy nadawana automatycznie przy zgłoszeniu sterownika (okno „Dane sterownika” może ją zmienić) */
  initialPumpConfig?: PumpConfig;
  /** kafelek sterownika na stronie /devices; null = brak danych do pokazania (kafelek tylko z nazwą) */
  tile?: (rootId: string, device: Device) => Promise<DeviceTile | null>;
}

// Kafelek sterownika na stronie /devices (GET /devices/summary): stan, kilka kluczowych wartości i ewentualny
// błąd albo ostrzeżenie. Każdy rodzaj buduje go w swoim tile.ts (pole tile w DeviceTypeModule), a klient
// rysuje jednym komponentem. Teksty i wartości są gotowe do wyświetlenia.
export type TileLevel = 'ok' | 'warn' | 'err' | 'off';

/** nazwa piktogramu z klienta (client/src/core/components/pictograms.tsx) */
export type TileIcon =
  'thermo' | 'target' | 'bolt' | 'sliders' | 'sun' | 'drop' | 'timer' | 'repeat' | 'flame' | 'tap'
  | 'pellet' | 'power' | 'battery' | 'panel' | 'bubbles' | 'waves';

export interface TileFact { icon: TileIcon; value: string; label?: string }

export interface TileRelay {
  name: string;
  on: boolean;
  text: string;
}

export interface DeviceTile {
  /** kolor paska kafelka: ok (zielony), warn (pomarańczowy), err (czerwony, z ramką), off (szary) */
  level: TileLevel;
  /** tekst w prawym górnym rogu; running = niebieski chip z pulsującą kropką („teraz pracuje”) */
  chip: string;
  running?: boolean;
  /** wartość główna (duża, po lewej) i pozostałe w prawej kolumnie, wyrównane do prawej */
  main?: TileFact;
  /** druga wartość obok głównej (hydrofor: woda w miesiącu obok wody dziś); bez własnej ikony */
  main2?: TileFact;
  side?: TileFact[];
  /** drugi wiersz wartości: pierwsza po lewej, ostatnia po prawej */
  row?: TileFact[];
  /** włącznik: przekaźniki zamiast wartości */
  relays?: TileRelay[];
  /** jedna linia o błędzie albo ostrzeżeniu */
  note?: { level: 'warn' | 'err'; text: string };
  /** czas ostatnich danych (ISO): klient pisze „dane sprzed …” */
  updatedAt?: string;
  /** własny tekst stopki zamiast „dane sprzed …” (np. „ostatnie uruchomienie dziś 14:32”) */
  foot?: string;
}
