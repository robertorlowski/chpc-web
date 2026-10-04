// Hak „na całe okno”: element (karta z wykresem albo tabelą) dostaje wysokość od swojej górnej
// krawędzi do stopki „Aktywne urządzenie” (pozycja fixed), przeliczaną przy zmianie rozmiaru okna
// i obrocie telefonu. Strona z takim elementem ma klasę `fill-page` (style.css): bez dolnego odstępu
// .app-main i z kartą na całą szerokość, więc sama się nie przewija; przewija się zawartość elementu.
// minHeight chroni przed zbyt małym elementem na niskim oknie (wtedy przewija się strona).
import { DependencyList, useLayoutEffect, useRef } from 'react';

const BOTTOM_GAP_PX = 8;

export function useFillHeight<T extends HTMLElement>(minHeight = 240, deps: DependencyList = []) {
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    const update = () => {
      const element = ref.current;
      if (!element) return;
      const footer = document.querySelector('.device-footer')?.getBoundingClientRect().height ?? 0;
      const top = element.getBoundingClientRect().top + window.scrollY;
      const height = `${Math.max(minHeight, window.innerHeight - top - footer - BOTTOM_GAP_PX)}px`;
      if (element.style.height !== height) element.style.height = height;
    };
    update();
    window.addEventListener('resize', update);
    // stopka „Aktywne urządzenie” pojawia się dopiero po pobraniu listy urządzeń (i znika przy jednym),
    // więc wysokość jest sprawdzana jeszcze co sekundę; styl zmienia się tylko przy innej wartości
    const timer = window.setInterval(update, 1000);
    return () => {
      window.removeEventListener('resize', update);
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return ref;
}
