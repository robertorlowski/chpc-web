// Ikona konta po prawej stronie nagłówka (konta użytkowników, 2026-10-11): imię i e-mail, „Moje dane”, „Wyloguj”,
// „Usuń konto” (otwiera okno potwierdzenia na stronie /account). Zamykane kliknięciem obok i klawiszem Esc.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, userDisplayName } from '../context/AuthContext';
import { getTheme, setTheme, THEME_LABELS, ThemeChoice } from '../theme';
import './account.css';

// „RO” z imienia i nazwiska (albo pierwsze dwie litery e-maila) do kółka w pasku
function initials(name: string): string {
  const parts = name.trim().split(/[\s@._-]+/).filter(Boolean);
  const text = parts.length >= 2 ? parts[0][0] + parts[1][0] : name.slice(0, 2);
  return text.toUpperCase();
}

export function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [theme, chooseTheme] = useState<ThemeChoice>(getTheme);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  if (!user) return null;
  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <div className="user-menu" ref={box}>
      <button type="button" className={`user-menu-button${open ? ' active' : ''}`} aria-haspopup="menu" aria-expanded={open}
        aria-label={`Konto: ${userDisplayName(user)}`} title={userDisplayName(user)} onClick={() => setOpen((value) => !value)}>
        <span className="user-menu-avatar" aria-hidden="true">{initials(userDisplayName(user))}</span>
      </button>
      {open && (
        <div className="user-menu-list" role="menu">
          <div className="user-menu-who">
            <strong>{userDisplayName(user)}</strong>
            {user.email && <span>{user.email}</span>}
          </div>
          <button type="button" role="menuitem" onClick={() => go('/account')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>
            {user.isSystem ? 'Konto' : 'Moje dane'}
          </button>
          {/* motyw: jasny / ciemny / jak system (core/theme.ts) */}
          <div className="user-menu-theme" role="group" aria-label="Motyw">
            {(Object.keys(THEME_LABELS) as ThemeChoice[]).map((choice) => (
              <button key={choice} type="button" className={theme === choice ? 'active' : ''} aria-pressed={theme === choice}
                onClick={() => { setTheme(choice); chooseTheme(choice); }}>{THEME_LABELS[choice]}</button>
            ))}
          </div>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); void logout(); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" /></svg>
            Wyloguj
          </button>
          {!user.isSystem && (
            <button type="button" role="menuitem" className="user-menu-danger" onClick={() => go('/account?delete=1')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>
              Usuń konto
            </button>
          )}
        </div>
      )}
    </div>
  );
}
