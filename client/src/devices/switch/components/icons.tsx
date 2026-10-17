// Ikony stron włącznika, których nie ma w core/components/icons.tsx: strzałki nawigacji po dacie,
// pobranie CSV i zamknięcie okna. Zestaw z makiety „Instrument” (siatka 24, kreska 1.8, kolor z currentColor).
const icon = (path: React.ReactNode) => (
  <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
    strokeLinejoin="round" aria-hidden="true">{path}</svg>
);

export const PrevIcon = () => icon(<path d="M15 5l-7 7 7 7" />);
export const NextIcon = () => icon(<path d="M9 5l7 7-7 7" />);
export const DownloadIcon = () => icon(<path d="M12 3v12M7 10l5 5 5-5M4 21h16" />);
export const CloseIcon = () => icon(<path d="M6 6l12 12M18 6L6 18" />);
