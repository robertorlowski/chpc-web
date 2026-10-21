// Formaty hydroforu: litry, czasy i daty w strefie Europe/Warsaw, nazwy okresów do nawigacji po dacie,
// przesuwanie dnia / miesiąca, eksport CSV. Wodę i efektywny czas pompy liczy serwer (pola waterLiters
// i pumpSeconds uruchomień).
import { WaterPressureTankRun } from '../types';
import { getLang, locale, t as tr } from '../../../core/i18n';

const TIME_ZONE = 'Europe/Warsaw';
const loc = () => locale(getLang());

export const formatLiters = (value: number | null | undefined) =>
  value === null || value === undefined ? '---' : value.toLocaleString(loc(), { maximumFractionDigits: 1 });

export const formatTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString(loc(), { timeZone: TIME_ZONE }) : '---';

export const formatDateTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleString(loc(), { timeZone: TIME_ZONE }) : '---';

export const formatDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString(loc(), { timeZone: TIME_ZONE }) : '---';

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

// Data uruchomienia jako dzień warszawski YYYY-MM-DD (grupowanie uruchomień po dniach).
export const dayWarsaw = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TIME_ZONE });

// Przesunięcie dnia YYYY-MM-DD o n dni (w kalendarzu, bez strefy: same daty).
export const shiftDay = (date: string, n: number) => {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + n)).toISOString().slice(0, 10);
};

// Przesunięcie miesiąca YYYY-MM o n miesięcy.
export const shiftMonth = (month: string, n: number) => {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber - 1 + n, 1)).toISOString().slice(0, 7);
};

// Nazwy okresów w nawigacji po dacie: „16 października 2026”, „październik 2026”, „2026”.
export const dayLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(loc(), { day: 'numeric', month: 'long', year: 'numeric' });
export const monthLabel = (month: string) =>
  new Date(`${month}-01T12:00:00`).toLocaleDateString(loc(), { month: 'long', year: 'numeric' });

// Skrót dnia tygodnia („pt”, „sb”) dla daty YYYY-MM-DD, jak na osi wykresu tygodnia w makiecie
// (dwuliterowe, bo „niedz.” z toLocaleDateString nie mieści się na telefonie).
const WEEK_DAYS_SHORT = { pl: ['nd', 'pn', 'wt', 'śr', 'cz', 'pt', 'sb'], en: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] };
export const weekDayShort = (date: string) => WEEK_DAYS_SHORT[getLang()][new Date(`${date}T12:00:00`).getDay()];

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
  const header = [tr('wt.csv.date'), tr('wt.csv.start'), tr('wt.csv.pump'), tr('wt.csv.compressor'), tr('wt.csv.water'), tr('sw.csv.approximate')];
  const rows = runs.map((run) => [
    formatDate(run.pumpStart),
    formatTime(run.pumpStart),
    run.pumpSeconds ?? '',
    compressorSeconds(run) ?? '',
    run.waterLiters === null ? '' : String(run.waterLiters).replace('.', ','),
    run.timeApproximate ? tr('common.yesLower') : '',
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
