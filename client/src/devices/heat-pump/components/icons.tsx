// Ikony stron pompy ciepła w kreskę 1.8 jak w makiecie „Instrument” (makiety/src/makieta.html, zestaw ICONS):
// strzałki nawigacji po dacie, pobieranie CSV, dzwonek błędu, potwierdzenie. Klasa .ic daje rozmiar z makieta.css.
import { ReactNode } from 'react';

const icon = (paths: ReactNode) => (
  <svg className="ic" aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {paths}
  </svg>
);

export const PrevIcon = () => icon(<path d="M15 5l-7 7 7 7" />);
export const NextIcon = () => icon(<path d="M9 5l7 7-7 7" />);
export const DownloadIcon = () => icon(<path d="M12 3v12M7 10l5 5 5-5M4 21h16" />);
export const BellIcon = () => icon(<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0" />);
export const CheckIcon = () => icon(<path d="M5 12l5 5 9-10" />);
export const CloseIcon = () => icon(<path d="M6 6l12 12M18 6L6 18" />);
