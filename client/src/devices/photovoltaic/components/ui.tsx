// Drobne elementy wyglądu „Instrument” dla stron fotowoltaiki (makiety/src/makieta.html, klasy z client/src/makieta.css):
// ikony kreską 1,8 (jak w makiecie), przełącznik segmentowy (.segmented .seg-inline) i nawigacja po dacie (.date-nav:
// strzałki wstecz / dalej, bieżąca data z dopiskiem „dziś”, a pod etykietą niewidoczne pole daty, które po kliknięciu
// otwiera kalendarz przeglądarki — makieta ma same strzałki, aplikacja zachowuje bezpośredni wybór dnia).
import { MouseEvent } from 'react';
import { formatDay, formatMonth, shiftDate, todayWarsaw } from '../utils/pv';
import { useLang } from '../../../core/i18n';

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


// kalendarz przeglądarki po kliknięciu etykiety (showPicker nie wszędzie jest; wtedy zostaje samo pole)
const openPicker = (event: MouseEvent<HTMLInputElement>) => {
  const input = event.currentTarget as HTMLInputElement & { showPicker?: () => void };
  try { input.showPicker?.(); } catch { /* przeglądarka bez showPicker albo bez gestu użytkownika */ }
};

// date: YYYY-MM-DD (miesiąc i rok biorą swój przedrostek); dalej niż dziś nie da się przejść
export function DateNav({ unit, date, onChange }: { unit: DateUnit; date: string; onChange: (date: string) => void }) {
  const { t } = useLang();
  const today = todayWarsaw();
  const prefix = unit === 'day' ? 10 : unit === 'month' ? 7 : 4;
  const isToday = date.slice(0, prefix) === today.slice(0, prefix);
  const text = unit === 'day' ? formatDay(date) : unit === 'month' ? formatMonth(date) : date.slice(0, 4);
  const unitName = t(unit === 'day' ? 'common.dayUnit' : unit === 'month' ? 'common.monthUnit' : 'common.yearUnit');
  const prevLabel = t('common.prevUnit', { unit: unitName });
  const nextLabel = t('common.nextUnit', { unit: unitName });
  return (
    <div className="date-nav">
      <button type="button" className="icon-btn sm" aria-label={prevLabel} onClick={() => onChange(shiftDate(date, unit, -1))}>
        <PrevIcon />
      </button>
      <label className="date-cur">
        {text}
        {isToday && <small>{unit === 'day' ? t('wx.today') : unit === 'month' ? t('pv.thisMonth') : t('pv.thisYear')}</small>}
        {unit === 'day' && (
          <input className="date-pick" type="date" value={date} max={today} aria-label={t('common.pickDate')} onClick={openPicker}
            onChange={(event) => event.currentTarget.value && onChange(event.currentTarget.value)} />
        )}
        {unit === 'month' && (
          <input className="date-pick" type="month" value={date.slice(0, 7)} max={today.slice(0, 7)} aria-label={t('pv.pickMonth')} onClick={openPicker}
            onChange={(event) => event.currentTarget.value && onChange(`${event.currentTarget.value}-01`)} />
        )}
      </label>
      <button type="button" className="icon-btn sm" aria-label={nextLabel} disabled={isToday} onClick={() => onChange(shiftDate(date, unit, 1))}>
        <NextIcon />
      </button>
    </div>
  );
}
