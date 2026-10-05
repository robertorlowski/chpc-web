// Tryb pracy pompy w aplikacji (ręczny / automatyczny / OFF) i jedna para temperatur od–do,
// tłumaczone na obecny kontrakt sterownika co (work_mode M/A/CWU/OFF, co_* i cwu_*), dopóki co
// nie dostanie nowego (etap 4). Podłączenie pompy (devices.pumpConfig.connection) wybiera tryb co:
// CWU → work_mode CWU, CO → M; obie pary temperatur dostają te same wartości, więc co użyje
// właściwej niezależnie od trybu (w OFF też: co 1.1.1 wysyła w OFF temperatury ostatniego trybu).
import { DeviceProperties, PumpConnection } from '../../../core/types';
import { HpEntry, OperationEntry, PumpWorkMode } from '../types';

export const PUMP_WORK_MODES: PumpWorkMode[] = ['MANUAL', 'AUTO', 'OFF'];

// Zakres temperatury od–do (jak co: 1–50 °C).
export const PUMP_TEMPERATURE_MIN = 1;
export const PUMP_TEMPERATURE_MAX = 50;

const text = (value: unknown): string | undefined =>
  value === undefined || value === null || value === '' ? undefined : String(value);

// Tryb z properties.work_mode; dawne wartości: M (ręczne CO) → ręczny, A i CWU (harmonogramy) → automatyczny.
export function pumpWorkMode(value: unknown): PumpWorkMode {
  if (value === 'MANUAL' || value === 'M') return 'MANUAL';
  if (value === 'AUTO' || value === 'A' || value === 'CWU') return 'AUTO';
  if (value === 'OFF') return 'OFF';
  return 'MANUAL';
}

// Temperatury od–do poza harmonogramem: temp_min/temp_max, a w urządzeniu sprzed zmiany para
// pasująca do podłączenia (co_* albo cwu_*), na końcu ostatnia telemetria.
export function pumpTemperatures(
  properties: DeviceProperties,
  connection: PumpConnection,
  lastData: HpEntry = {},
): { min?: string; max?: string } {
  const co = connection === 'co';
  return {
    min: text(properties.temp_min) ?? text(co ? properties.co_min : properties.cwu_min)
      ?? text(co ? lastData.co_min : lastData.cwu_min),
    max: text(properties.temp_max) ?? text(co ? properties.co_max : properties.cwu_max)
      ?? text(co ? lastData.co_max : lastData.cwu_max),
  };
}

// Obie pary co_* i cwu_* z tej samej temperatury; brak wartości = brak klucza (co zostawia swoją).
export function temperatureFields(min?: string, max?: string): OperationEntry {
  return {
    ...(min !== undefined ? { co_min: min, cwu_min: min } : {}),
    ...(max !== undefined ? { co_max: max, cwu_max: max } : {}),
  };
}

// Praca pompy: tryb co według podłączenia.
export function heatingOperation(connection: PumpConnection, min?: string, max?: string, force = '0'): OperationEntry {
  return { work_mode: connection === 'co' ? 'M' : 'CWU', force, ...temperatureFields(min, max) };
}

// Pompa wyłączona; temperatury idą dalej, żeby zmiana w OFF doszła od razu do pompy.
export function offOperation(min?: string, max?: string): OperationEntry {
  return { work_mode: 'OFF', force: '0', ...temperatureFields(min, max) };
}

// Temperatura od–do z aplikacji: liczby 1–50 °C, od ≤ do. Zwraca opis błędu albo null.
export function temperatureError(min: unknown, max: unknown): string | null {
  const values = [min, max].filter((value) => value !== undefined);
  for (const value of values) {
    const number = Number(value);
    if (value === '' || !Number.isFinite(number) || number < PUMP_TEMPERATURE_MIN || number > PUMP_TEMPERATURE_MAX) {
      return `Temperatura: ${PUMP_TEMPERATURE_MIN}–${PUMP_TEMPERATURE_MAX} °C.`;
    }
  }
  if (min !== undefined && max !== undefined && Number(min) > Number(max)) {
    return 'Temperatura od nie może być wyższa niż do.';
  }
  return null;
}
