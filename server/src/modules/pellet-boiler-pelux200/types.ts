import type { DeviceType, WeekDay } from '../../core/types';

// Typy kotła pelletowego Plum Pellux 200 (regulator ecoMAX): odczyt wysyłany
// przez sterownik co (kolekcja pellet_boiler_pelux200). Wszystkie pola pomiarowe
// są opcjonalne: sterownik wysyła to, co udało się odczytać.

export interface PelletBoilerPelux200Measurements {
  /** stan kotła 0..11: OFF, STABILIZATION, KINDLING, WORKING, SUPERVISION, PAUSED, STANDBY, BURNING_OFF, ALERT, MANUAL, UNSEALING, OTHER */
  state?: number;
  // temperatury [°C]
  heating_temp?: number;
  feeder_temp?: number;
  water_heater_temp?: number;
  outside_temp?: number;
  return_temp?: number;
  exhaust_temp?: number;
  optical_temp?: number;
  upper_buffer_temp?: number;
  lower_buffer_temp?: number;
  heating_target?: number;
  water_heater_target?: number;
  heating_status?: number;
  water_heater_status?: number;
  /** poziom paliwa [%] */
  fuel_level?: number;
  /** moc dmuchawy [%] */
  fan_power?: number;
  /** obciążenie kotła [%] */
  boiler_load?: number;
  /** moc kotła [kW] */
  boiler_power?: number;
  /** zużycie paliwa [kg/h] */
  fuel_consumption?: number;
  /** poziom tlenu w spalinach (lambda) [%] */
  lambda_level?: number;
  // wyjścia
  fan?: boolean;
  feeder?: boolean;
  heating_pump?: boolean;
  water_heater_pump?: boolean;
  circulation_pump?: boolean;
  lighter?: boolean;
  alarm?: boolean;
  // mieszacze 1 (grzejniki) i 2 od firmware 1.2.0; brak pól = mieszacz niepodłączony
  /** temperatura obiegu mieszacza [°C] */
  /** termostat pokojowy eSTER: temperatura w pokoju i zadana (firmware pieca od 1.8.0) */
  room_temp?: number;
  room_target_temp?: number;
  mixer1_temp?: number;
  /** zadana mieszacza [°C] */
  mixer1_target?: number;
  mixer1_pump?: boolean;
  /** siłownik zaworu otwiera */
  mixer1_opening?: boolean;
  /** siłownik zaworu zamyka */
  mixer1_closing?: boolean;
  mixer2_temp?: number;
  mixer2_target?: number;
  /** liczba aktywnych alarmów kotła (firmware pieca od 1.7.0) */
  alerts_active?: number;
  /** surowe output_flags z SensorData (firmware pieca od 1.8.0), bez pokazywania w aplikacji */
  output_flags?: number;
  /** narastający licznik spalonego pelletu [kg] (firmware pieca od 1.7.1) */
  fuel_burned_kg?: number;
  mixer2_pump?: boolean;
  mixer2_opening?: boolean;
  mixer2_closing?: boolean;
  /** tryb „Pompa ciepła”: sprężarka pompy ciepła pracowała przy zapisie odczytu (dopisuje serwer) */
  heat_pump_running?: boolean;
}

/** Ustawienia regulatora ze sterownika: surowe dane odpowiedzi (hex), jak /boiler-settings.json. */
export interface PelletBoilerSettingsRaw {
  /** odpowiedź 0xB1: [0, pierwszy nr, liczba] + liczba × (wartość, min, max) */
  ecomax_parameters?: string;
  /** odpowiedź 0xB2: [0, pierwszy nr, liczba, mieszacze] + mieszacze × liczba × 3 */
  mixer_parameters?: string;
  thermostat_parameters?: string;
  schedules?: string;
  regulator_data_schema?: string;
}

/** Parametr po rozkodowaniu (wartość, min i max w jednostkach, raw = bajty z ramki). */
export interface PelletBoilerParameter {
  index: number;
  name: string | null;
  label?: string;
  description?: string;
  /** ocena zmiany z docs/parametry-kotla.md */
  rating?: string;
  unit?: string;
  kind?: 'switch';
  /** wartość = (surowa − offset) × step (brak = 1 i 0) */
  step?: number;
  offset?: number;
  value: number;
  min: number;
  max: number;
  raw: [number, number, number];
}

export interface PelletBoilerSettingsView {
  readAt: Date;
  deviceId?: string;
  groups: { key: string; label: string; parameters: PelletBoilerParameter[] }[];
  mixers: { mixer: number; parameters: PelletBoilerParameter[] }[];
  /** przełączniki harmonogramów regulatora z odpowiedzi 0xB6 (godzin nie pokazujemy) */
  schedules: PelletBoilerScheduleSwitch[];
}

/** Harmonogram regulatora: numer jak w PyPlumIO (4 = czyszczenie kotła), włączony albo nie. */
export interface PelletBoilerScheduleSwitch {
  index: number;
  name: string;
  label: string;
  enabled: boolean;
}

/** Zmiana parametru z aplikacji: parametr kotła (0x33) albo mieszacza (0x34), wartość surowa. */
export interface PelletBoilerCommandChange {
  /** control: włącz (1) / wyłącz (0) regulator, index 0; schedule: harmonogram nr index włącz (1) / wyłącz (0), ramka 0x37 (firmware od 1.8.0) */
  kind: 'ecomax' | 'mixer' | 'control' | 'schedule';
  /** numer mieszacza od 1 (kind = mixer) */
  mixer?: number;
  index: number;
  value: number;
  /** wysłać dopiero, gdy kocioł zgłosi stan „wyłączony” (0) w odczycie nowszym niż zlecenie — zmiana trybu pracy */
  waitOff?: boolean;
}

export type PelletBoilerCommandStatus = 'pending' | 'sent' | 'done' | 'error' | 'replaced';

export interface PelletBoilerCommandEntry extends PelletBoilerCommandChange {
  _id?: unknown;
  rootId: string;
  previous?: number;
  label?: string;
  status: PelletBoilerCommandStatus;
  error?: string;
  sentAt?: Date;
  doneAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

/** Tryb pracy kotła: pompa ciepła (kocioł bez palenia) albo pellet (kociol-ustawienia.md, punkt 4b). */
export type PelletBoilerMode = 'heat-pump' | 'pellet';

/** CWU od (start ładowania) i do (zadana) [°C]: zadana nr 119 = do, histereza nr 123 = do − od. */
export interface PelletBoilerCwuRange {
  cwuFrom: number;
  cwuTo: number;
}

/** Sezon regulatora (Tryb LATO, nr 125): zima = 0 (CO i CWU), lato = 1 (tylko CWU). */
export type PelletBoilerSeason = 'winter' | 'summer';

/** Wpis harmonogramu dla jednego trybu pracy kotła w oknie godzin: type cwu = CWU od–do, type season =
 * sezon Lato / Zima (od 2026-10-04), opcjonalnie tylko przy temperaturze zewnętrznej poniżej coldBelow.
 * Włączanie i wyłączanie kotła z harmonogramu usunięto 2026-10-04; stare wpisy type = work są pomijane. */
export interface PelletBoilerScheduleEntry extends Partial<PelletBoilerCwuRange> {
  _id?: unknown;
  rootId: string;
  type: 'cwu' | 'season';
  mode: PelletBoilerMode;
  enabled: boolean;
  dayOfWeek?: WeekDay;
  date?: Date;
  startTime: string;
  endTime: string;
  /** type season: sezon w oknie */
  season?: PelletBoilerSeason;
  /** type season: wpis działa tylko, gdy temperatura zewnętrzna (czujnik kotła) jest poniżej [°C]; brak = zawsze */
  coldBelow?: number | null;
}

/** Stan, który harmonogram ustawia w kotle; paused = harmonogram nie działa („Wyłącz regulator”).
 * season brak = sezonem harmonogram nie steruje (brak wpisu i brak sezonu poza harmonogramem);
 * seasonScheduleId = działający wpis sezonu (do histerezy progu temperatury). */
export interface PelletBoilerScheduleState extends PelletBoilerCwuRange {
  mode: PelletBoilerMode;
  season?: PelletBoilerSeason;
  seasonScheduleId?: string | null;
  paused?: boolean;
}

/** Wartości poza harmonogramem dla trybu: CWU od–do i sezon (brak sezonu = harmonogram go nie zmienia). */
export interface PelletBoilerScheduleDefaults extends PelletBoilerCwuRange {
  season?: PelletBoilerSeason;
}

/** Nastawy trybu: klucz „ecomax:<nr>” albo „mixer<n>:<nr>” → wartość surowa. */
export type PelletBoilerProfile = Record<string, number>;

/** Ładowanie CWU w trybie pompy ciepła (pellet-boiler-pelux200-cwu-loading.service.ts) dla ekranu kotła. */
export interface PelletBoilerCwuLoading {
  active: boolean;
  since: Date | null;
  /** pompa ciepła w trybie OFF: ładowanie trwa, ale pompa nie dogrzewa wody */
  heatPumpOff: boolean;
  /** błąd zgłoszenia do pompy ciepła (brak pompy, HTTP) */
  error?: string;
}

/** Automatyczne przejście na Pellet po rozpalaniu w trybie pompy ciepła (komunikat do „OK”). */
export interface PelletBoilerAutoPellet {
  /** czas odczytu z rozpalaniem */
  at: Date;
  acknowledged: boolean;
  /** liczba zleconych zmian nastaw */
  changes: number;
  error?: string;
}

export interface PelletBoilerScheduleSettings {
  rootId: string;
  /** „Praca kotła” w Ustawieniach: true = włączony, pracuje według harmonogramu; false = wyłączony
   *  (zlecenie wyłącz, harmonogram stoi) */
  enabled: boolean;
  /** CWU i praca kotła poza harmonogramem, osobno dla trybu */
  defaults: Record<PelletBoilerMode, PelletBoilerScheduleDefaults>;
  /** nastawy kotła stosowane przy przełączeniu trybu (Ustawienia → Tryb pracy) */
  profiles: Record<PelletBoilerMode, PelletBoilerProfile>;
  lastApplied?: PelletBoilerScheduleState;
  lastAppliedAt?: Date;
  lastError?: string;
  /** ładowanie CWU w trybie pompy ciepła, dla ekranu kotła */
  cwuLoading?: PelletBoilerCwuLoading;
  /** automatyczne przejście na Pellet (pellet-boiler-pelux200-auto-pellet.service.ts) */
  autoPellet?: PelletBoilerAutoPellet;
  /** cykl Zimy w trybie pompy ciepła (pellet-boiler-pelux200-winter-cycle.service.ts); null = nie działa */
  winterCycle?: PelletBoilerWinterCycle | null;
  /** sezon wybrany przyciskiem w Ustawieniach (tryb pompy ciepła); obowiązuje do zmiany sezonu z harmonogramu */
  manualSeason?: PelletBoilerManualSeason | null;
}

/** Cykl Zimy: waiting = Lato, czeka na kocioł ≥ 40 °C; winter = Zima do kotła < 30 °C przy stojącej pompie CO. */
export type PelletBoilerWinterCycle = {
  phase: 'waiting' | 'winter';
  since: Date;
  /** temperatura kotła (heating_temp) z ostatniego świeżego odczytu [°C] */
  temperature: number | null;
  /** ostatnie wymuszenie startu sprężarki pompy ciepła */
  forcedAt?: Date | null;
};

export type PelletBoilerManualSeason = {
  season: PelletBoilerSeason;
  at: Date;
  /** sezon z harmonogramu w chwili wyboru (null = harmonogram sezonem nie sterował); jego zmiana kończy wybór */
  scheduled: PelletBoilerSeason | null;
};

export interface PelletBoilerPelux200Entry extends PelletBoilerPelux200Measurements {
  rootId: string;
  deviceType?: DeviceType;
  deviceId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
