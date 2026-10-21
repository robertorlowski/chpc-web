// Konto zalogowanego (konta użytkowników, 2026-10-11): stan sesji dla AuthGate (core/App.tsx), zalogowanie po
// kodzie lub linku z maila (token najpierw w sessionStorage), odpowiedź na pytanie o 90 dni (Tak = localStorage),
// wylogowanie i reakcja na 401 z serwera (sesja wygasła, konto usunięte) — powrót do ekranu logowania.
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { AuthRequests } from '../api';
import { clearToken, getToken, setDemoSession, storeToken, UNAUTHORIZED_EVENT } from '../auth';
import { ApiError } from '../http';
import { getLang, isLang, Lang, setLang } from '../i18n';
import { User } from '../types';
import { useDevice } from './DeviceContext';

type Status = 'loading' | 'anonymous' | 'signed' | 'offline';

type AuthContextValue = {
  status: Status;
  user: User | null;
  /** po zalogowaniu kodem albo linkiem: pytanie „Zapamiętać Twoje dane …?” */
  askRemember: boolean;
  signIn: (token: string, user: User) => void;
  answerRemember: (remember: boolean) => Promise<void>;
  setUser: (user: User) => void;
  logout: () => Promise<void>;
  retry: () => void;
  /** zmiana języka aplikacji (core/i18n) z zapisem w koncie (PUT /auth/me/language) */
  changeLanguage: (lang: Lang) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { clearDevice } = useDevice();
  const [status, setStatus] = useState<Status>(() => (getToken() ? 'loading' : 'anonymous'));
  const [user, setUserState] = useState<User | null>(null);
  const [askRemember, setAskRemember] = useState(false);

  const signOutLocally = useCallback(() => {
    clearToken();
    clearDevice();
    setUserState(null);
    setAskRemember(false);
    setStatus('anonymous');
  }, []);

  // Język konta (wersja językowa 2026-10-21): konto z wybranym językiem narzuca go przeglądarce; konto bez wyboru
  // dostaje bieżący język aplikacji (z przeglądarki albo z ekranu logowania), żeby maile i powiadomienia były w nim
  const syncLanguage = (me: User) => {
    if (isLang(me.language)) {
      if (me.language !== getLang()) setLang(me.language);
    } else if (!me.isDemo) {
      AuthRequests.setLanguage(getLang()).catch(() => undefined);
    }
  };

  const load = useCallback(() => {
    if (!getToken()) return setStatus('anonymous');
    setStatus('loading');
    AuthRequests.me()
      .then((me) => {
        setDemoSession(!!me.isDemo);
        syncLanguage(me);
        setUserState(me);
        setStatus('signed');
      })
      .catch((error: ApiError) => {
        if (error.status === 401) signOutLocally();
        else setStatus('offline');
      });
  }, [signOutLocally]);

  useEffect(load, [load]);

  useEffect(() => {
    window.addEventListener(UNAUTHORIZED_EVENT, signOutLocally);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, signOutLocally);
  }, [signOutLocally]);

  const signIn = (token: string, signedUser: User) => {
    // inny użytkownik może mieć inne sterowniki: start od listy
    clearDevice();
    storeToken(token, false);
    setDemoSession(!!signedUser.isDemo);
    syncLanguage(signedUser);
    setUserState(signedUser);
    setAskRemember(!signedUser.isDemo);
    setStatus('signed');
  };

  const answerRemember = async (remember: boolean) => {
    const token = getToken();
    if (token) {
      await AuthRequests.remember(remember);
      storeToken(token, remember);
    }
    setAskRemember(false);
  };

  const logout = async () => {
    await AuthRequests.logout().catch(() => undefined);
    signOutLocally();
  };

  const changeLanguage = (lang: Lang) => {
    setLang(lang);
    if (user && !user.isDemo) {
      setUserState({ ...user, language: lang });
      AuthRequests.setLanguage(lang).catch(() => undefined);
    }
  };

  return (
    <AuthContext.Provider value={{ status, user, askRemember, signIn, answerRemember, setUser: setUserState, logout, retry: load, changeLanguage }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth musi być użyty wewnątrz AuthProvider.');
  return value;
}

// nazwa konta do paska i kart; t (core/i18n) tłumaczy „system” — bez niego zostaje polski
export const userDisplayName = (user: User, t?: (key: string) => string) =>
  user.isSystem ? (t ? t('user.system') : 'system') : [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || '';
