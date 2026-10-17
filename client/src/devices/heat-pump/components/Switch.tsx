// Przełącznik z makiety (.switch, makieta.css). Bez onChange to sam wskaźnik stanu (Podgląd: stan przekaźników
// z telemetrii); z onChange to przycisk role="switch" (Ustawienia). disabled = wyszarzony stan z pompy, którego
// teraz nie można zmienić (sprężarka pracuje, tryb OFF).
type Props = {
  on: boolean;
  label: string;
  title?: string;
  disabled?: boolean;
  onChange?: (on: boolean) => void;
};

export function Switch({ on, label, title, disabled, onChange }: Props) {
  const classes = `switch${on ? ' is-on' : ''}${disabled ? ' is-disabled' : ''}`;
  if (!onChange) {
    return <span className={classes} role="switch" aria-checked={on} aria-readonly="true" aria-label={label} title={title} />;
  }
  return (
    <button type="button" className={classes} role="switch" aria-checked={on} aria-label={label} title={title}
      disabled={disabled} onClick={() => onChange(!on)} />
  );
}
