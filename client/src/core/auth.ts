// Token sesji (konta użytkowników, 2026-10-11): w localStorage po „Zapamiętać … na najbliższe 14 dni? — Tak”,
// inaczej w sessionStorage (znika po zamknięciu przeglądarki). http.ts dodaje go jako Authorization: Bearer;
// odpowiedź 401 wysyła zdarzenie UNAUTHORIZED_EVENT, na które AuthContext wylogowuje.
const KEY = 'chpc.session';
export const UNAUTHORIZED_EVENT = 'chpc:unauthorized';

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
}

export const notifyUnauthorized = () => window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
