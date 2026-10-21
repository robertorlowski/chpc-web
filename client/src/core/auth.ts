// Token sesji (konta użytkowników, 2026-10-11): w localStorage po „Zapamiętać … na najbliższe 90 dni? — Tak”,
// inaczej w sessionStorage (znika po zamknięciu przeglądarki). http.ts dodaje go jako Authorization: Bearer;
// odpowiedź 401 wysyła zdarzenie UNAUTHORIZED_EVENT, na które AuthContext wylogowuje.
const KEY = 'chpc.session';
// wersja demo: flaga obok tokenu (http.ts zatrzymuje zapisy jeszcze przed wysłaniem i pokazuje komunikat)
const DEMO_KEY = 'chpc.demo';
export const UNAUTHORIZED_EVENT = 'chpc:unauthorized';
export const DEMO_BLOCKED_EVENT = 'chpc:demo-blocked';

const safe = <T,>(action: () => T, fallback: T): T => {
  try {
    return action();
  } catch {
    return fallback;
  }
};

export const getToken = (): string | null =>
  safe(() => localStorage.getItem(KEY) ?? sessionStorage.getItem(KEY), null);

export function storeToken(token: string, remember: boolean) {
  clearToken();
  safe(() => (remember ? localStorage : sessionStorage).setItem(KEY, token), undefined);
}

export function clearToken() {
  safe(() => localStorage.removeItem(KEY), undefined);
  safe(() => sessionStorage.removeItem(KEY), undefined);
  safe(() => sessionStorage.removeItem(DEMO_KEY), undefined);
}

export const setDemoSession = (demo: boolean) => safe(() => (demo ? sessionStorage.setItem(DEMO_KEY, '1') : sessionStorage.removeItem(DEMO_KEY)), undefined);
export const isDemoSession = () => safe(() => sessionStorage.getItem(DEMO_KEY) === '1', false);
export const notifyDemoBlocked = () => window.dispatchEvent(new Event(DEMO_BLOCKED_EVENT));

export const notifyUnauthorized = () => window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
