import { DeviceProperties, WaterPressureRun, WaterTank } from '../api/type';

const ATMOSPHERE_BAR = 1.013;
const TIME_ZONE = 'Europe/Warsaw';

// Ten sam wzór co estimateWater w server/src/modules/water-pressure/services/water-pressure.service.ts
// (zmieniać razem). Klient liczy tylko podgląd w Ustawieniach i na głównym
// oknie; wartość zapisaną w uruchomieniu liczy serwer.
export function tankWaterLiters(tank: WaterTank, pressureLow?: number, pressureHigh?: number): number {
  const low = Number(pressureLow);
  const high = Number(pressureHigh);
  if (!tank.enabled || !(tank.volumeLiters > 0)) return 0;
  if (!Number.isFinite(low) || !Number.isFinite(high) || high <= low || low < 0) return 0;

  const lowAbs = low + ATMOSPHERE_BAR;
  const highAbs = high + ATMOSPHERE_BAR;
  if (tank.kind === 'air') {
    return (tank.k ?? 1) * tank.volumeLiters * ATMOSPHERE_BAR * (1 / lowAbs - 1 / highAbs);
  }
  const prechargeAbs = (tank.precharge ?? 0) + ATMOSPHERE_BAR;
  if (prechargeAbs >= highAbs) return 0;
  return tank.volumeLiters * prechargeAbs * (1 / Math.max(lowAbs, prechargeAbs) - 1 / highAbs);
}

export function estimatedWaterPerRun(properties?: DeviceProperties): number {
  return (properties?.tanks ?? []).reduce(
    (sum, tank) => sum + tankWaterLiters(tank, properties?.pressure_low, properties?.pressure_high), 0);
}

// Pojemność walca z obwodu i wysokości [cm] w litrach: V = C² · h / (4π).
export function cylinderLiters(circumferenceCm: number, heightCm: number): number {
  if (!(circumferenceCm > 0) || !(heightCm > 0)) return 0;
  return (circumferenceCm ** 2 * heightCm) / (4 * Math.PI) / 1000;
}

export const formatLiters = (value: number | null | undefined) =>
  value === null || value === undefined ? '---' : value.toLocaleString('pl-PL', { maximumFractionDigits: 1 });

export const tankKindLabel = (kind: WaterTank['kind']) => kind === 'air' ? 'poduszka powietrzna' : 'przeponowy';

export const formatTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString('pl-PL', { timeZone: TIME_ZONE }) : '---';

export const formatDateTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('pl-PL', { timeZone: TIME_ZONE }) : '---';

export const formatDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('pl-PL', { timeZone: TIME_ZONE }) : '---';

const secondsBetween = (from?: string, to?: string) =>
  from && to ? Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 1000)) : undefined;

export const pumpSeconds = (run: WaterPressureRun) => secondsBetween(run.pumpStart, run.pumpEnd);
export const compressorSeconds = (run: WaterPressureRun) => secondsBetween(run.compressorStart, run.compressorEnd);

// Dzisiejsza data w Warszawie jako YYYY-MM-DD (format en-CA).
export const todayWarsaw = () => new Date().toLocaleDateString('en-CA', { timeZone: TIME_ZONE });

export const monthBounds = (month: string) => {
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, '0')}` };
};

export const sumWater = (runs: WaterPressureRun[]) => runs.reduce((sum, run) => sum + (run.waterLiters ?? 0), 0);

export const runsToCsv = (runs: WaterPressureRun[]) => {
  const header = ['Data', 'Start pompy', 'Pompa [s]', 'Kompresor [s]', 'Woda [l]', 'Czas przybliżony'];
  const rows = runs.map((run) => [
    formatDate(run.pumpStart),
    formatTime(run.pumpStart),
    pumpSeconds(run) ?? '',
    compressorSeconds(run) ?? '',
    String(run.waterLiters ?? 0).replace('.', ','),
    run.timeApproximate ? 'tak' : '',
  ].join(';'));
  return [header.join(';'), ...rows].join('\n');
};

export const downloadText = (content: string, fileName: string) => {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};
