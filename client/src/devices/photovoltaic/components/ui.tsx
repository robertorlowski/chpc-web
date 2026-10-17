// Drobne elementy wyglądu „Instrument” dla stron fotowoltaiki (makiety/src/makieta.html, klasy z client/src/makieta.css):
// ikony kreską 1,8 (jak w makiecie), przełącznik segmentowy (.segmented .seg-inline) i nawigacja po dacie (.date-nav:
// strzałki wstecz / dalej, bieżąca data z dopiskiem „dziś”, a pod etykietą niewidoczne pole daty, które po kliknięciu
// otwiera kalendarz przeglądarki — makieta ma same strzałki, aplikacja zachowuje bezpośredni wybór dnia).
import { MouseEvent } from 'react';
import { formatDay, formatMonth, shiftDate, todayWarsaw } from '../utils/pv';

const Icon = ({ d }: { d: string }) => (
  <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
    strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);

export const PrevIcon = () => <Icon d="M15 5l-7 7 7 7" />;
export const NextIcon = () => <Icon d="M9 5l7 7-7 7" />;
export const DownloadIcon = () => <Icon d="M12 3v12M7 10l5 5 5-5M4 21h16" />;
export const EditIcon = () => <Icon d="M4 20h4l10-10-4-4L4 16zM13 7l4 4" />;

export type SegmentOption<T extends string> = { value: T; label: string; disabled?: boolean };

export function Segmented<T extends string>({ name, label, value, options, onChange }: {
  name: string; label: string; value: T; options: SegmentOption<T>[]; onChange: (value: T) => void;
}) {
  return (
    <div className="segmented seg-inline" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <label key={option.value} className="seg">
          <input type="radio" name={name} value={option.value} checked={value === option.value} disabled={option.disabled}
            onChange={() => onChange(option.value)} />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}

type DateUnit = 'day' | 'month' | 'year';

const UNIT_LABELS: Record<DateUnit, [string, string]> = {
  day: ['Poprzedni dzień', 'Następny dzień'],
  month: ['Poprzedni miesiąc', 'Następny miesiąc'],
  year: ['Poprzedni rok', 'Następny rok'],
};

// kalendarz przeglądarki po kliknięciu etykiety (showPicker nie wszędzie jest; wtedy zostaje samo pole)
const openPicker = (event: MouseEvent<HTMLInputElement>) => {
  const input = event.currentTarget as HTMLInputElement & { showPicker?: () => void };
  try { input.showPicker?.(); } catch { /* przeglądarka bez showPicker albo bez gestu użytkownika */ }
};

// date: YYYY-MM-DD (miesiąc i rok biorą swój przedrostek); dalej niż dziś nie da się przejść
export function DateNav({ unit, date, onChange }: { unit: DateUnit; date: string; onChange: (date: string) => void }) {
  const today = todayWarsaw();
  const prefix = unit === 'day' ? 10 : unit === 'month' ? 7 : 4;
  const isToday = date.slice(0, prefix) === today.slice(0, prefix);
  const text = unit === 'day' ? formatDay(date) : unit === 'month' ? formatMonth(date) : date.slice(0, 4);
  const [prevLabel, nextLabel] = UNIT_LABELS[unit];
  return (
    <div className="date-nav">
      <button type="button" className="icon-btn sm" aria-label={prevLabel} onClick={() => onChange(shiftDate(date, unit, -1))}>
        <PrevIcon />
      </button>
      <label className="date-cur">
        {text}
        {isToday && <small>{unit === 'day' ? 'dziś' : unit === 'month' ? 'ten miesiąc' : 'ten rok'}</small>}
        {unit === 'day' && (
          <input className="date-pick" type="date" value={date} max={today} aria-label="Wybierz dzień" onClick={openPicker}
            onChange={(event) => event.currentTarget.value && onChange(event.currentTarget.value)} />
        )}
        {unit === 'month' && (
          <input className="date-pick" type="month" value={date.slice(0, 7)} max={today.slice(0, 7)} aria-label="Wybierz miesiąc" onClick={openPicker}
            onChange={(event) => event.currentTarget.value && onChange(`${event.currentTarget.value}-01`)} />
        )}
      </label>
      <button type="button" className="icon-btn sm" aria-label={nextLabel} disabled={isToday} onClick={() => onChange(shiftDate(date, unit, 1))}>
        <NextIcon />
      </button>
    </div>
  );
}
