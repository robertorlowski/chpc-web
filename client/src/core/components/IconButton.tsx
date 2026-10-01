// Szablon przycisku-ikony dla całej aplikacji: sama ikona w kolorze akcentu, bez tła i ramki
// (format z Ustawień hydroforu). Etykieta jest jednocześnie podpowiedzią (title) i nazwą dla
// czytników ekranu (aria-label), więc nie da się jej pominąć. Warianty: domyślny (akcent) i
// danger (szary, czerwony po najechaniu: usuwanie). Ikony akcji: components/icons.tsx.
// Przycisk tekstowy zostaje tam, gdzie akcja wymaga słowa (np. „Zapisz”, „Anuluj”).
//
// Użycie:
//   <IconButton label="Dodaj zbiornik" icon={<PlusIcon />} onClick={addTank} />
//   <IconButton label="Usuń wersję" variant="danger" icon={<TrashIcon />} onClick={remove} />
// Pozycjonowanie (np. w rogu karty) robi className wywołującego, wygląd jest z iconButton.css.
import { ButtonHTMLAttributes, ReactNode } from 'react';
import './iconButton.css';

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title' | 'aria-label' | 'children'> & {
  icon: ReactNode;
  label: string;
  variant?: 'default' | 'danger';
  /** zaznaczony stan przełącznika (np. otwarty kalkulator): ciemniejszy kolor */
  active?: boolean;
};

export function IconButton({
  icon, label, variant = 'default', active = false, className = '', type = 'button', ...rest
}: IconButtonProps) {
  const classes = ['icon-button', variant === 'danger' ? 'icon-button-danger' : '', active ? 'active' : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button type={type} className={classes} title={label} aria-label={label} {...rest}>
      {icon}
    </button>
  );
}
