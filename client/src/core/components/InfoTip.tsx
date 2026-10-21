// Ikona „i” z dymkiem (2026-10-11): stałe opisy i podpowiedzi zamiast tekstu na ekranie. Dotknięcie albo
// kliknięcie otwiera dymek pod ikoną (przy dolnej krawędzi ekranu — nad nią), w granicach okna także na telefonie
// 360 px; ponowne dotknięcie, dotknięcie obok (pointerdown: także iPhone, gdzie puste miejsce nie daje mousedown),
// Esc albo przewinięcie strony go zamyka. Na ekranie zostają stany na żywo, ostrzeżenia i instrukcje.
import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLang } from '../i18n';
import './infoTip.css';

const MARGIN = 8;
const GAP = 6;
const MAX_WIDTH = 320;

// Akapit w dymku (span blokowy: dymek bywa w label, summary i nagłówkach, gdzie nie wolno używać p ani div).
export const TipParagraph = ({ children }: { children: ReactNode }) => <span className="info-tip-paragraph">{children}</span>;

export function InfoTip({ children, label: labelProp }: { children: ReactNode; label?: string }) {
  const { t } = useLang();
  const label = labelProp ?? t('common.info');
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);

  // 1. pod ikoną, w granicach okna w poziomie
  useLayoutEffect(() => {
    if (!open || !button.current) return setPosition(null);
    const rect = button.current.getBoundingClientRect();
    const width = Math.min(MAX_WIDTH, window.innerWidth - 2 * MARGIN);
    const left = Math.min(Math.max(rect.left - 12, MARGIN), window.innerWidth - width - MARGIN);
    setPosition({ top: rect.bottom + GAP, left, width });
  }, [open]);

  // 2. dymek wychodzi poza dół ekranu: nad ikoną (albo przy górnej krawędzi, gdy jest wyższy niż miejsce nad nią)
  useLayoutEffect(() => {
    if (!position || !bubble.current || !button.current) return;
    const height = bubble.current.offsetHeight;
    if (position.top + height <= window.innerHeight - MARGIN) return;
    const above = button.current.getBoundingClientRect().top - GAP - height;
    const top = Math.max(MARGIN, above);
    if (top !== position.top) setPosition({ ...position, top });
  }, [position]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => {
      const target = event.target as Node;
      if (!button.current?.contains(target) && !bubble.current?.contains(target)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    const close = () => setOpen(false);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', key);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', key);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  return (
    <>
      <button ref={button} type="button" className={`info-tip${open ? ' open' : ''}`} aria-label={label} aria-expanded={open}
        title={label} onClick={(event) => { event.preventDefault(); event.stopPropagation(); setOpen((value) => !value); }}>
        i
      </button>
      {open && (
        <span ref={bubble} className="info-tip-bubble" role="tooltip"
          style={position ? { top: position.top, left: position.left, width: position.width } : { visibility: 'hidden' }}
          onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}>
          {children}
        </span>
      )}
    </>
  );
}
