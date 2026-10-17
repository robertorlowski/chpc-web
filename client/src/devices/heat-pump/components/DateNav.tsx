// Nawigacja po dacie z makiety (.date-nav: strzałka wstecz, data z dopiskiem „dziś”, strzałka dalej).
// Zakładki Dane i Wykres (Dzień) przechodzą po dniach z danymi (GET /hp/dates, hook useHpDates), Wykres
// (Miesiąc, Rok) po kolejnych miesiącach i latach. Kliknięcie daty otwiera listę wszystkich pozycji (select
// bez ramki, wygląd tekstu), więc odległy dzień wybiera się bez wielokrotnego klikania strzałek.
import { useEffect, useState } from 'react';
import { IconButton } from '../../../core/components/IconButton';
import { HpRequests } from '../api';
import { formatDateYMD } from '../utils/utils';
import { NextIcon, PrevIcon } from './icons';

type Props = {
  /** pozycje od najnowszej do najstarszej, wartość i etykieta */
  items: ReadonlyArray<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  /** dopisek przy dacie, np. „dziś” */
  note?: string;
  /** nazwa jednostki do etykiet strzałek („dzień”, „miesiąc”, „rok”) */
  unit: string;
};

export function DateNav({ items, value, onChange, note, unit }: Props) {
  const index = items.findIndex((item) => item.value === value);
  const older = index >= 0 && index < items.length - 1 ? items[index + 1] : undefined;
  const newer = index > 0 ? items[index - 1] : undefined;
  const current = items[index];
  return (
    <div className="date-nav">
      <IconButton className="date-nav-btn" label={`Poprzedni ${unit}`} icon={<PrevIcon />} disabled={!older}
        onClick={() => older && onChange(older.value)} />
      <span className="date-cur">
        <select aria-label="Wybór daty" value={value} onChange={(event) => onChange(event.target.value)} disabled={items.length === 0}>
          {items.length === 0 && <option value="">Brak danych</option>}
          {index < 0 && value && <option value={value}>{value}</option>}
          {items.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <span className="date-cur-text" aria-hidden="true">{current?.label ?? (value || 'Brak danych')}</span>
        {note && <small>{note}</small>}
      </span>
      <IconButton className="date-nav-btn" label={`Następny ${unit}`} icon={<NextIcon />} disabled={!newer}
        onClick={() => newer && onChange(newer.value)} />
    </div>
  );
}

// „YYYY.MM.DD” (format co i GET /hp/dates) jako „DD.MM.YYYY”.
export const formatDayLabel = (value: string): string => {
  const parts = value.split(/[.-]/);
  return parts.length === 3 && parts[0].length === 4 ? `${parts[2]}.${parts[1]}.${parts[0]}` : value;
};

// Dni z danymi pompy od najnowszego. Gdy wybranej daty nie ma na liście (np. dziś bez danych), wybiera najnowszy
// dzień i zgłasza go przez onChange (dawny DateDict).
export function useHpDates(value: string, onChange: (value: string) => void) {
  const [dates, setDates] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    HpRequests.getHpAvailableDates().then((available) => {
      if (!active) return;
      const unique = Array.from(new Set(available ?? [])).sort().reverse();
      setDates(unique);
      if (unique.length > 0 && !unique.includes(value)) onChange(unique[0]);
    }).catch(() => undefined);
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return dates;
}

export const isToday = (value: string) => value === formatDateYMD(new Date());
