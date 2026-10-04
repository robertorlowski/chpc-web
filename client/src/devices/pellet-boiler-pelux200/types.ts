// Typy kotła pelletowego Plum Pellux 200 (regulator ecoMAX): odczyt ze sterownika.
// Kontrakt z modułem serwera pellet-boiler-pelux200; wszystkie pola odczytu są opcjonalne.

import type { WeekDay } from '../../core/types';

export type PelletBoilerReading = {
  createdAt?: string;
  /** stan kotła 0..11 (BOILER_STATE_NAMES) */
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
  // temperatury zadane [°C] i stany obiegów (liczby z regulatora)
  heating_target?: number;
  water_heater_target?: number;
  heating_status?: number;
  water_heater_status?: number;
  // paliwo i praca
  fuel_level?: number;
  fan_power?: number;
  boiler_load?: number;
  boiler_power?: number;
  fuel_consumption?: number;
  lambda_level?: number;
  // wyjścia
  fan?: boolean;
  feeder?: boolean;
  heating_pump?: boolean;
  water_heater_pump?: boolean;
  circulation_pump?: boolean;
  lighter?: boolean;
  alarm?: boolean;
  // mieszacze 1 (grzejniki) i 2 od firmware 1.2.0; brak pól = niepodłączony albo starszy firmware
  mixer1_temp?: number;
  mixer1_target?: number;
  mixer1_pump?: boolean;
  mixer1_opening?: boolean;
  mixer1_closing?: boolean;
  mixer2_temp?: number;
  mixer2_target?: number;
  mixer2_pump?: boolean;
  mixer2_opening?: boolean;
  mixer2_closing?: boolean;
};

/** Parametr regulatora z GET /pellet-boiler-pelux200/settings (rozkodowany na serwerze). */
export type PelletBoilerParameter = {
  /** numer parametru w regulatorze (ramka zmiany 0x33 / 0x34) */
  index: number;
  /** nazwa w PyPlumIO, null dla pozycji bez nazwy */
  name: string | null;
  label?: string;
  description?: string;
  /** ocena zmiany: „Bezpieczny z aplikacji”, „Ostrożnie”, „Tylko serwis”, „Nie ruszać” */
  rating?: string;
  unit?: string;
  kind?: 'switch';
  /** wartość = (surowa − offset) × step (brak = 1 i 0); z nich aplikacja liczy wartość surową zlecenia */
  step?: number;
  offset?: number;
  value: number;
  min: number;
  max: number;
  raw: [number, number, number];
};

/** Zmiana parametru dla regulatora: kotła (0x33) albo mieszacza (0x34), wartość surowa (bajt). */
export type PelletBoilerChange = {
  /** control: włącz (1) / wyłącz (0) regulator */
  kind: 'ecomax' | 'mixer' | 'control';
  /** numer mieszacza od 1 */
  mixer?: number;
  index: number;
  value: number;
  /** wysłać dopiero, gdy kocioł zgłosi stan „wyłączony” (zmiana trybu pracy) */
  waitOff?: boolean;
};

/** Zlecenie zmiany z GET/POST /pellet-boiler-pelux200/commands. */
export type PelletBoilerCommand = PelletBoilerChange & {
  _id: string;
  previous?: number;
  label?: string;
  /** pending: czeka na sterownik, sent: u sterownika, done: regulator potwierdził, replaced: zastąpione nowszym */
  status: 'pending' | 'sent' | 'done' | 'error' | 'replaced';
  error?: string;
  createdAt: string;
  doneAt?: string;
};

/** Tryb pracy kotła: pompa ciepła (bez palenia) albo pellet. */
export type PelletBoilerMode = 'heat-pump' | 'pellet';

/** Sezon regulatora (nr 125): zima (CO i CWU) albo lato (tylko CWU). */
export type PelletBoilerSeason = 'winter' | 'summer';

/** Wpis harmonogramu dla trybu w oknie godzin: type cwu = CWU od–do (od = start ładowania, do = zadana),
 *  type season = tryb pracy Lato / Zima, opcjonalnie tylko przy temperaturze zewnętrznej poniżej coldBelow. */
export type PelletBoilerSchedule = {
  _id?: string;
  type: 'cwu' | 'season';
  mode: PelletBoilerMode;
  enabled: boolean;
  dayOfWeek?: WeekDay;
  date?: string;
  startTime: string;
  endTime: string;
  cwuFrom?: number;
  cwuTo?: number;
  season?: PelletBoilerSeason;
  coldBelow?: number | null;
};

export type PelletBoilerCwuRange = { cwuFrom: number; cwuTo: number };

/** Poza harmonogramem: CWU od–do i tryb pracy Lato / Zima (brak = harmonogram go nie zmienia). */
export type PelletBoilerScheduleDefaults = PelletBoilerCwuRange & { season?: PelletBoilerSeason };

/** Nastawy trybu: klucz „ecomax:<nr>” albo „mixer<n>:<nr>” → wartość surowa. */
export type PelletBoilerProfile = Record<string, number>;

/** Ustawienia harmonogramu: działa / nie działa (enabled, przyciski „Włącz/Wyłącz regulator”),
 *  CWU poza harmonogramem oraz nastawy trybów. */
export type PelletBoilerScheduleSettings = {
  enabled: boolean;
  defaults: Record<PelletBoilerMode, PelletBoilerScheduleDefaults>;
  profiles: Record<PelletBoilerMode, PelletBoilerProfile>;
  lastError?: string;
};

export type PelletBoilerCurrentSchedule = {
  enabled: boolean;
  /** tryb z odczytu ustawień kotła; null bez odczytu */
  mode: PelletBoilerMode | null;
  state: ({ mode: PelletBoilerMode; season?: PelletBoilerSeason } & PelletBoilerCwuRange) | null;
  /** działający wpis CWU (null = poza harmonogramem) */
  scheduleId: string | null;
  /** działający wpis trybu pracy Lato / Zima (null = poza harmonogramem) */
  seasonScheduleId?: string | null;
  /** temperatura zewnętrzna z serwera (IMGW); null bez pomiaru */
  outdoorTemperature?: number | null;
  lastError: string | null;
};

/** Ostatni odczyt ustawień regulatora; {} (brak readAt), gdy sterownik jeszcze ich nie wysłał. */
export type PelletBoilerSettings = {
  readAt?: string;
  groups?: { key: string; label: string; parameters: PelletBoilerParameter[] }[];
  mixers?: { mixer: number; parameters: PelletBoilerParameter[] }[];
};

/** Ładowanie CWU w trybie pompy ciepła (GET /pellet-boiler-pelux200/cwu-loading); pompa ciepła grzeje wtedy 47–49 °C. */
export type PelletBoilerCwuLoading = {
  active: boolean;
  since: string | null;
  /** pompa ciepła w trybie OFF: nie dogrzeje wody */
  heatPumpOff: boolean;
  error?: string;
};

/** Automatyczne przejście na Pellet po rozpalaniu w trybie pompy ciepła (GET …/auto-pellet), do „OK”. */
export type PelletBoilerAutoPellet = {
  at: string;
  acknowledged: boolean;
  changes: number;
  error?: string;
};
