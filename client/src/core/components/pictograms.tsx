// Piktogramy liniowe w pastelowych kolorach (kafelki sterowników na /devices, kolory według znaczenia).
// Nazwy zgodne z TileIcon z serwera (core/types.ts); ostrzeżenie i błąd to osobne piktogramy przy komunikatach.
import { TileIcon } from '../types';

type Name = TileIcon | 'warn' | 'error' | 'chevron-left' | 'chevron-right';

const PICTOGRAMS: Record<Name, { color: string; paths: React.ReactNode }> = {
  thermo: { color: '#e8a09a', paths: <><path d="M10 14.5V5a2 2 0 1 1 4 0v9.5a4 4 0 1 1-4 0z" /><path d="M12 9v7" /></> },
  target: { color: '#b9a6d9', paths: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r=".6" /></> },
  bolt: { color: '#e6c873', paths: <path d="M13 3L5 13h6l-1 8 8-10h-6z" /> },
  sliders: { color: '#a9b8c9', paths: <><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></> },
  sun: { color: '#f0c987', paths: <><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" /></> },
  drop: { color: '#8dc3e6', paths: <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" /> },
  timer: { color: '#9fb6d8', paths: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l3 2M9 2h6" /></> },
  repeat: { color: '#a9b8c9', paths: <><path d="M17 3l4 4-4 4" /><path d="M3 11V9a2 2 0 0 1 2-2h16" /><path d="M7 21l-4-4 4-4" /><path d="M21 13v2a2 2 0 0 1-2 2H3" /></> },
  flame: { color: '#eeaa86', paths: <path d="M12 3c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 2.5 2 2.5 0-3-1-5 1-9z" /> },
  tap: { color: '#8dc3e6', paths: <><path d="M5 10h9a4 4 0 0 1 4 4v1" /><path d="M5 10V6h5" /><path d="M18 18v.1M16 20.5v.1M20 20.5v.1" /></> },
  pellet: { color: '#cdb48c', paths: <><ellipse cx="9" cy="8" rx="3.5" ry="2.2" /><ellipse cx="15" cy="12" rx="3.5" ry="2.2" /><ellipse cx="9" cy="16" rx="3.5" ry="2.2" /></> },
  power: { color: '#a9b8c9', paths: <><path d="M12 3v9" /><path d="M6.5 7a8 8 0 1 0 11 0" /></> },
  battery: { color: '#9fd0a8', paths: <><rect x="3" y="8" width="16" height="9" rx="2" /><path d="M21 11v3M7 11v3M11 11v3" /></> },
  panel: { color: '#8fb7d9', paths: <><path d="M4 6h16l-2 12H6z" /><path d="M9 6l-1 12M15 6l1 12M5 12h14" /></> },
  bubbles: { color: '#8dc3e6', paths: <><circle cx="9" cy="14" r="4" /><circle cx="16" cy="8" r="3" /><circle cx="17" cy="16" r="1.5" /></> },
  waves: { color: '#8dc3e6', paths: <path d="M3 9c3-3 6 3 9 0s6 3 9 0M3 15c3-3 6 3 9 0s6 3 9 0" /> },
  warn: { color: '#f0a95b', paths: <><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17v.1" /></> },
  error: { color: '#e07f7f', paths: <><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></> },
  'chevron-left': { color: 'currentColor', paths: <path d="M15 5L8 12L15 19" /> },
  'chevron-right': { color: 'currentColor', paths: <path d="M9 5L16 12L9 19" /> },
};

export function Pictogram({ name, className }: { name: Name; className?: string }) {
  const { color, paths } = PICTOGRAMS[name];
  return (
    <svg className={`pictogram${className ? ` ${className}` : ''}`} viewBox="0 0 24 24" style={{ color }} aria-hidden="true">
      {paths}
    </svg>
  );
}
