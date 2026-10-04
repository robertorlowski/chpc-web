import type { ScheduleEntry, SettingsEntry, WorkMode } from '../modules/heat-pump/types';

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
  // pompa ciepła: wartości domyślne operacji (scheduler, getDefaultOperation);
  // temperatury jako napisy, bo tak idą do sterownika w operacji
  co_min?: String;
  co_max?: String;
  cwu_min?: String;
  cwu_max?: String;
  work_mode?: WorkMode;
  // hydrofor
  compressor_seconds?: number;
  // kocioł pelletowy Pellux 200: odstęp odpytywania regulatora [s], 30–3600
  poll_interval_seconds?: number;
  // włącznik: domyślny czas „Włącz” [min] (0 = bez limitu), podpowiadany w aplikacji i na stronie sterownika
  default_on_minutes?: number;
}

export interface Device {
  deviceType: DeviceType;
  deviceId: string;
  name?: string;
  /** sterownik otwierany po starcie aplikacji; najwyżej jeden */
  isDefault?: boolean;
  /** wersja firmware zgłoszona przez sterownik przy ostatnim zgłoszeniu (pole version) i kiedy */
  firmwareVersion?: string;
  firmwareSeenAt?: Date;
  /** adres IPv4 sterownika w sieci lokalnej z ostatniego zgłoszenia (pole ip) i kiedy */
  ipAddress?: string;
  ipSeenAt?: Date;
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
  /** sterownik aktualizuje firmware przez sieć: odpowiedź na zgłoszenie niesie settings.firmware (core/services/firmware.service.ts) */
  firmwareUpdates?: boolean;
  /** dodatkowe pola zgłoszenia (np. liczba przekaźników włącznika); wołane przy każdym zgłoszeniu */
  onRegister?: (rootId: string, deviceId: string, body: Record<string, unknown>) => Promise<void>;
  /** wołane po zapisie ustawień urządzenia (PUT /device/properties), np. pompa kasuje ręczne nadpisania */
  onPropertiesSaved?: (rootId: string) => Promise<void>;
}
