// Nawigacja po dacie z makiety (.date-nav): strzałka wstecz, nazwa okresu („październik 2026”) i strzałka
// w przód, nieaktywna przy bieżącym okresie. Używana w Danych (miesiąc) i na Wykresie (dzień / miesiąc / rok).
import { IconButton } from '../../../core/components/IconButton';
import { NextIcon, PrevIcon } from './TankIcons';

export const DateNav: React.FC<{
  label: string;
  onPrev: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
  /** nazwa jednostki w podpowiedziach strzałek, np. „miesiąc” */
  unit: string;
}> = ({ label, onPrev, onNext, nextDisabled, unit }) => (
  <div className="date-nav">
    <IconButton label={`Poprzedni ${unit}`} icon={<PrevIcon />} onClick={onPrev} />
    <span className="date-cur">{label}</span>
    <IconButton label={`Następny ${unit}`} icon={<NextIcon />} onClick={onNext} disabled={nextDisabled} />
  </div>
);
