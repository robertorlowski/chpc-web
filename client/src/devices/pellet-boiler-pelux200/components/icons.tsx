// Ikony kotła pelletowego: płomień (menu, kafelek, palenie), pompa i zawór mieszacza (strona główna).
// Kolor bierze się z `currentColor`, więc o stanie (np. niebieska pompa w pracy) decyduje CSS.

// dwa języki płomienia, żeby ikona nie przypominała kropli hydroforu
export const FLAME_PATH = 'M12 2C12 2 9.5 5.5 9.5 8.5C9.5 10 10.3 11 10.3 11C9.4 10.6 8.3 9.6 8 8C6.2 9.8 5 12.2 5 14.5C5 18.4 8 21.5 12 21.5C16 21.5 19 18.4 19 14.5C19 10.5 15.5 8 14.5 5.5C13.9 6.6 13.6 7.7 13.6 8.6C12.7 7 12 4.5 12 2Z';

export const FlameIcon: React.FC<{ className?: string; filled?: boolean }> = ({ className, filled }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d={FLAME_PATH} stroke="currentColor" strokeWidth="2" strokeLinejoin="round"
      fill={filled ? 'currentColor' : 'none'} />
  </svg>
);

// Symbol pompy obiegowej: okrąg z trójkątem (kierunek przepływu) jak na schematach hydraulicznych.
export const PumpIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
    <path d="M8 6.5L19 12L8 17.5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
  </svg>
);

// Zawór mieszacza: symbol zaworu ze schematów (dwa trójkąty stykające się wierzchołkami) i strzałka ruchu:
// w górę = otwiera, w dół = zamyka, bez strzałki = stoi (od 2026-10-07 zamiast słów na stronie głównej).
export const ValveIcon: React.FC<{ className?: string; movement?: 'opening' | 'closing' }> = ({ className, movement }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M3 9.5L12 14.5L3 19.5Z M21 9.5L12 14.5L21 19.5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    {movement === 'opening' && <path d="M12 9V2.5M9 5.5L12 2.5L15 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
    {movement === 'closing' && <path d="M12 2.5V9M9 6L12 9L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
  </svg>
);
