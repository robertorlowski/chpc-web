import type { PumpWorkMode, ScheduleEntry, SettingsEntry, WorkMode } from '../modules/heat-pump/types';

// Typy części wspólnej: urządzenie, jego ustawienia i opis rodzaju sterownika.

// Wartości są zapisane w bazie (devices.deviceType, rekordy danych) i wysyłane
// przez sterowniki przy zgłoszeniu; zmiana wymaga migracji i firmware.
export enum DeviceType {
  HP = 'heat_pump',
  WATER_PRESSURE_TANK = 'water-pressure-tank',
  PELLET_BOILER_PELUX200 = 'pellet-boiler-pelux200',
  SWITCH = 'switch',
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
  /** pojemność zbiornika [l] (COP zbiornika w co) */
  tankLiters: number;
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
  controllerSettings?: (properties: DeviceProperties) => unknown;
  /** sterownik aktualizuje firmware przez sieć, na zlecenie z aplikacji: odpowiedź na zgłoszenie (i odpowiedzi
   * włącznika i pieca) niesie wtedy ofertę firmware (core/services/firmware.service.ts) */
  firmwareUpdates?: boolean;
  /** dodatkowe pola zgłoszenia (np. liczba przekaźników włącznika); wołane przy każdym zgłoszeniu */
  onRegister?: (rootId: string, deviceId: string, body: Record<string, unknown>) => Promise<void>;
  /** wołane po zapisie ustawień urządzenia (PUT /device/properties), np. pompa kasuje ręczne nadpisania */
  onPropertiesSaved?: (rootId: string) => Promise<void>;
  /** sprawdzenie definicji przed zapisem (okno „Dane sterownika”); DefinitionConflictError = 409 */
  checkDefinition?: (rootId: string, definition: { boilerConfig?: BoilerConfig }) => Promise<void>;
}
