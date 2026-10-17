// Ikony stron hydroforu z zestawu makiety „Instrument” (makiety/src/makieta.html, kreska 1.8): stan offline,
// strzałki nawigacji po dacie i pobieranie CSV. Ikony akcji wspólne dla aplikacji (edycja, kosz) są w core/components/icons.
import { ReactNode } from 'react';

const icon = (paths: ReactNode) => (
  <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths}</svg>
);

export const OfflineIcon = () => icon(<path d="M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M8.5 15.5a6 6 0 0 1 7 0M12 19h.01M3 3l18 18" />);
export const PrevIcon = () => icon(<path d="M15 5l-7 7 7 7" />);
export const NextIcon = () => icon(<path d="M9 5l7 7-7 7" />);
export const DownloadIcon = () => icon(<path d="M12 3v12M7 10l5 5 5-5M4 21h16" />);
