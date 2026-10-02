// Formaty hydroforu: litry, czasy i daty w strefie Europe/Warsaw, eksport CSV. Wodę i efektywny
// czas pompy liczy serwer (pola waterLiters i pumpSeconds uruchomień).
import { WaterPressureTankRun } from '../types';

const TIME_ZONE = 'Europe/Warsaw';

export const formatLiters = (value: number | null | undefined) =>
  value === null || value === undefined ? '---' : value.toLocaleString('pl-PL', { maximumFractionDigits: 1 });

export const formatTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString('pl-PL', { timeZone: TIME_ZONE }) : '---';

export const formatDateTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('pl-PL', { timeZone: TIME_ZONE }) : '---';

export const formatDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('pl-PL', { timeZone: TIME_ZONE }) : '---';

const secondsBetween = (from?: string, to?: string) =>
  from && to ? Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 1000)) : undefined;

// czas pracy pompy jako „1 h 05 min”, „4 min 10 s” albo „35 s”
export const formatDuration = (seconds: number | null | undefined) => {
  if (seconds === null || seconds === undefined) return '---';
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  if (hours > 0) return `${hours} h ${String(minutes).padStart(2, '0')} min`;
  if (minutes > 0) return `${minutes} min ${String(rest).padStart(2, '0')} s`;
  return `${rest} s`;
};

export const compressorSeconds = (run: WaterPressureTankRun) => secondsBetween(run.compressorStart, run.compressorEnd);

// Dzisiejsza data w Warszawie jako YYYY-MM-DD (format en-CA).
export const todayWarsaw = () => new Date().toLocaleDateString('en-CA', { timeZone: TIME_ZONE });

// Pierwszy i ostatni dzień miesiąca "YYYY-MM" jako YYYY-MM-DD (parametry from/to dla GET /runs).
export const monthBounds = (month: string) => {
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, '0')}` };
};

// suma wody; null, gdy żadne uruchomienie nie ma wody (brak przepływu)
export const sumWater = (runs: WaterPressureTankRun[]) =>
  runs.some((run) => run.waterLiters !== null)
    ? runs.reduce((sum, run) => sum + (run.waterLiters ?? 0), 0)
    : null;
export const sumPumpSeconds = (runs: WaterPressureTankRun[]) => runs.reduce((sum, run) => sum + (run.pumpSeconds ?? 0), 0);

// CSV dla Excela z polskimi ustawieniami: separator ';', przecinek dziesiętny w litrach.
export const runsToCsv = (runs: WaterPressureTankRun[]) => {
  const header = ['Data', 'Start pompy', 'Pompa [s]', 'Kompresor [s]', 'Woda [l]', 'Czas przybliżony'];
  const rows = runs.map((run) => [
    formatDate(run.pumpStart),
    formatTime(run.pumpStart),
    run.pumpSeconds ?? '',
    compressorSeconds(run) ?? '',
    run.waterLiters === null ? '' : String(run.waterLiters).replace('.', ','),
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
