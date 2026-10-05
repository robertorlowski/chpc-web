// Przełącznik trybu pracy pompy (Ręczny / Automatyczny / OFF) w Harmonogramie i Ustawieniach.
// Przyciski w jednej ramce; na telefonie na środku, na komputerze od lewej (workModeSwitch.css).
import { PUMP_WORK_MODE_LABELS, PumpWorkMode } from '../types';
import './workModeSwitch.css';

const MODES: PumpWorkMode[] = ['MANUAL', 'AUTO', 'OFF'];

type Props = {
  value: PumpWorkMode;
  onChange: (mode: PumpWorkMode) => void;
  disabled?: boolean;
  /** krótsze etykiety (Ustawienia na telefonie): „Automat.” */
  short?: boolean;
};

export function WorkModeSwitch({ value, onChange, disabled, short }: Props) {
  return (
    <div className="work-mode-switch" role="group" aria-label="Tryb pracy">
      {MODES.map((mode) => (
        <button
          key={mode}
          type="button"
          className={value === mode ? 'on' : ''}
          aria-pressed={value === mode}
          disabled={disabled}
          onClick={() => onChange(mode)}
        >
          {short && mode === 'AUTO' ? 'Automat.' : PUMP_WORK_MODE_LABELS[mode]}
        </button>
      ))}
    </div>
  );
}

// Opis trybu pod przełącznikiem.
export const WORK_MODE_HINTS: Record<PumpWorkMode, string> = {
  MANUAL: 'Ustawienia domyślne.',
  AUTO: 'Według harmonogramu; poza wpisami ustawienia domyślne.',
  OFF: 'Pompa wyłączona.',
};
