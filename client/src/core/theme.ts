// Motyw aplikacji (jasny / ciemny / jak system): wybór w localStorage (chpc.theme), zastosowany jako data-theme na <html>.
// Bez wyboru decyduje prefers-color-scheme (tokeny w theme.css). Wołane z index.tsx przy starcie i z menu konta (UserMenu).
export type ThemeChoice = 'light' | 'dark' | 'system';

const KEY = 'chpc.theme';

export function getTheme(): ThemeChoice {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
}

export function setTheme(choice: ThemeChoice) {
  try {
    if (choice === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // prywatne okno albo zablokowany localStorage: wybór działa do przeładowania
  }
  applyTheme(choice);
}

export const THEME_LABELS: Record<ThemeChoice, string> = { light: 'Jasny', dark: 'Ciemny', system: 'Jak system' };
