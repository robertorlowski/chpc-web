// Przełącznik segmentowy z makiety (.segmented / .seg, makieta.css): grupa radio, zaznaczony segment w kolorze
// akcentu. Używany do trybu pracy pompy (Harmonogram, Ustawienia), rodzaju wpisu i okresu wykresu.
// inline = segmenty na szerokość treści (pasek filtrów), domyślnie na całą szerokość karty.
import { PumpWorkMode, pumpWorkModeLabel } from '../types';

export type SegmentedOption<T extends string> = { value: T; label: string; title?: string };

type Props<T extends string> = {
  name: string;
  label: string;
  value: T;
  options: ReadonlyArray<SegmentedOption<T>>;
  onChange: (value: T) => void;
  disabled?: boolean;
  inline?: boolean;
};

export function Segmented<T extends string>({ name, label, value, options, onChange, disabled, inline }: Props<T>) {
  return (
    <div className={`segmented${inline ? ' seg-inline' : ''}`} role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <label className="seg" key={option.value} title={option.title}>
          <input type="radio" name={name} value={option.value} checked={value === option.value} disabled={disabled}
            onChange={() => onChange(option.value)} />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}

// Tryb pracy pompy: Ręczny / Automatyczny / Wyłączony (słownik hp.mode.*; OFF w makiecie to „Wyłączony”).
export const workModeOptions = (t: (key: string) => string): ReadonlyArray<SegmentedOption<PumpWorkMode>> => [
  { value: 'MANUAL', label: pumpWorkModeLabel('MANUAL', t) },
  { value: 'AUTO', label: pumpWorkModeLabel('AUTO', t) },
  { value: 'OFF', label: t('hp.mode.offLabel') },
];

// Opis trybu pod przełącznikiem (słownik hp.modeHint.*).
export const workModeHint = (mode: PumpWorkMode, t: (key: string) => string): string => t(`hp.modeHint.${mode}`);
