// Konto zalogowanego (konta użytkowników, 2026-10-11): stan sesji dla AuthGate (core/App.tsx), zalogowanie po
// kodzie lub linku z maila (token najpierw w sessionStorage), odpowiedź na pytanie o 14 dni (Tak = localStorage),
// wylogowanie i reakcja na 401 z serwera (sesja wygasła, konto usunięte) — powrót do ekranu logowania.
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { AuthRequests } from '../api';
import { clearToken, getToken, storeToken, UNAUTHORIZED_EVENT } from '../auth';
import { ApiError } from '../http';
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

  const load = useCallback(() => {
    if (!getToken()) return setStatus('anonymous');
    setStatus('loading');
    AuthRequests.me()
      .then((me) => {
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
    setUserState(signedUser);
    setAskRemember(true);
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

  return (
    <AuthContext.Provider value={{ status, user, askRemember, signIn, answerRemember, setUser: setUserState, logout, retry: load }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth musi być użyty wewnątrz AuthProvider.');
  return value;
}

export const userDisplayName = (user: User) =>
  user.isSystem ? 'system' : [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || '';
