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
};
