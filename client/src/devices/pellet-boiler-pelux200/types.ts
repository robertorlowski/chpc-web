// Typy kotła pelletowego Plum Pellux 200 (regulator ecoMAX): odczyt ze sterownika.
// Kontrakt z modułem serwera pellet-boiler-pelux200; wszystkie pola odczytu są opcjonalne.

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
  value: number;
  min: number;
  max: number;
  raw: [number, number, number];
};

/** Ostatni odczyt ustawień regulatora; {} (brak readAt), gdy sterownik jeszcze ich nie wysłał. */
export type PelletBoilerSettings = {
  readAt?: string;
  groups?: { key: string; label: string; parameters: PelletBoilerParameter[] }[];
  mixers?: { mixer: number; parameters: PelletBoilerParameter[] }[];
};
