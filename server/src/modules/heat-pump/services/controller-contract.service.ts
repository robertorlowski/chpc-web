// Kontrakt operacji dla sterownika co według wersji firmware (devices.firmwareVersion ze zgłoszenia).
// Wewnątrz serwera operacja ma dawną postać (work_mode M / CWU / OFF, pary co_* i cwu_*, pump-mode.service.ts),
// a odpowiedź /hp/add dostaje:
// - co starsze niż 1.2.0 (albo bez wersji): operację bez zmian, bez kluczy nowego kontraktu;
// - co od 1.2.0: work_mode MANUAL / AUTO / OFF (tryb pracy z properties), temp_min / temp_max zamiast par,
//   bez co_pomp, a przy pełnej operacji (z work_mode, od schedulera) także konfigurację pompy: pv_force, pv_dtu,
//   tank_liters (okno „Dane sterownika”) i cop_pause (pracuje pompa CO kotła przy podłączeniu CO).
// Konfiguracja idzie tylko z work_mode: co po restarcie nie może dostać samej konfiguracji, bo przyjąłby
// domyślny tryb OFF do najbliższej pełnej operacji.
import { PumpConfig } from '../../../core/types';
import { OperationEntry, PumpWorkMode } from '../types';

export const NEW_CONTRACT_VERSION = [1, 2, 0];

// Wersja „a.b.c” co najmniej 1.2.0; brak albo inny format = stary kontrakt.
export function supportsNewContract(version?: string | null): boolean {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version ?? '');
  if (!match) return false;
  const parts = match.slice(1).map(Number);
  for (let i = 0; i < 3; i++) {
    if (parts[i] !== NEW_CONTRACT_VERSION[i]) return parts[i] > NEW_CONTRACT_VERSION[i];
  }
  return true;
}

export type ContractContext = {
  firmwareVersion?: string | null;
  /** tryb pracy z properties (ręczny / automatyczny / OFF) */
  pumpMode: PumpWorkMode;
  pumpConfig?: PumpConfig | null;
  /** pompa CO kotła pracuje (z odczytu kotła); znaczenie tylko przy podłączeniu CO */
  boilerCoPump?: boolean;
};

const DEFAULT_TANK_LITERS = 300;

export function toControllerOperation(operation: OperationEntry, context: ContractContext): OperationEntry {
  if (!supportsNewContract(context.firmwareVersion)) return operation;

  const { co_min, co_max, cwu_min, cwu_max, co_pomp: _relay, work_mode, temp_min: _a, temp_max: _b, ...rest } = operation;
  const result: OperationEntry = { ...rest };
  const minimum = cwu_min ?? co_min;
  const maximum = cwu_max ?? co_max;
  if (minimum !== undefined) result.temp_min = minimum;
  if (maximum !== undefined) result.temp_max = maximum;
  if (work_mode !== undefined) {
    // pompa pracuje (operacja inna niż OFF) przy trybie OFF w ustawieniach = ręczne nadpisanie: ręczny
    result.work_mode = work_mode === 'OFF' ? 'OFF' : context.pumpMode === 'AUTO' ? 'AUTO' : 'MANUAL';
    const config = context.pumpConfig;
    result.pv_force = config?.pvDtu && config.pvForce ? '1' : '0';
    result.pv_dtu = config ? (config.pvDtu ? '1' : '0') : '1';
    result.tank_liters = String(config?.tankLiters ?? DEFAULT_TANK_LITERS);
    result.cop_pause = config?.connection === 'co' && context.boilerCoPump ? '1' : '0';
  }
  return result;
}
