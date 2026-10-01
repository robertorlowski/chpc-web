import type { DeviceType } from '../../core/types';

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
}

export interface PelletBoilerPelux200Entry extends PelletBoilerPelux200Measurements {
  rootId: string;
  deviceType?: DeviceType;
  deviceId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
