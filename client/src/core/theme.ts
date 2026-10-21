// Motyw aplikacji (jasny / ciemny / jak system): wybór w localStorage (chpc.theme), zastosowany jako data-theme na <html>.
// Bez zapisanego wyboru motyw jest jasny (od 2026-10-17; wcześniej „jak system”). „Jak system” zdejmuje data-theme
// i decyduje prefers-color-scheme (tokeny w theme.css). Ten sam wybór ustawia skrypt w client/index.html przed
// pierwszym rysowaniem (bez mignięcia ciemnego tła). Wołane z index.tsx przy starcie, z ikony w pasku (ThemeToggle)
// i z menu konta (UserMenu); zmiana rozsyła zdarzenie, więc oba miejsca pokazują ten sam stan.
import { useEffect, useState } from 'react';

export type ThemeChoice = 'light' | 'dark' | 'system';

const KEY = 'chpc.theme';
const DEFAULT_THEME: ThemeChoice = 'light';
const CHANGE_EVENT = 'chpc-theme-change';

export function getTheme(): ThemeChoice {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' || value === 'system' ? value : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
}

export function setTheme(choice: ThemeChoice) {
  try {
    // „system” jest zapisywany jawnie: brak klucza oznacza motyw domyślny (jasny)
    localStorage.setItem(KEY, choice);
  } catch {
    // prywatne okno albo zablokowany localStorage: wybór działa do przeładowania
  }
  applyTheme(choice);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

const systemDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;

// Motyw, który faktycznie widać: przy „Jak system” jasny albo ciemny z ustawień systemu
export function effectiveTheme(choice: ThemeChoice): 'light' | 'dark' {
  return choice === 'system' ? (systemDark() ? 'dark' : 'light') : choice;
}

// Bieżący wybór i widoczny motyw; odświeża się po zmianie w innym miejscu aplikacji i po zmianie motywu systemu
export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(getTheme);
  const [, setSystemTick] = useState(0);
  useEffect(() => {
    const onChange = () => setChoice(getTheme());
    const onSystem = () => setSystemTick((tick) => tick + 1);
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    window.addEventListener(CHANGE_EVENT, onChange);
    media?.addEventListener('change', onSystem);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      media?.removeEventListener('change', onSystem);
    };
  }, []);
  return { choice, effective: effectiveTheme(choice) };
}

// kolejność w menu konta; nazwy w słowniku (core/i18n, klucze theme.light / theme.dark / theme.system)
export const THEME_CHOICES: ThemeChoice[] = ['light', 'dark', 'system'];
