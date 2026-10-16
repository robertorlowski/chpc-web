// Logowanie i rejestracja (konta użytkowników, 2026-10-11) — jeden ekran dla każdej ścieżki bez sesji:
// e-mail → kod z maila (6 cyfr, 10 min, 5 prób, nowy kod po 60 s) albo link z maila (/login?token=…).
// Wpisanie „system” zamiast e-maila pokazuje pole hasła (użytkownik systemowy; bez osobnego linku na ekranie).
import { FormEvent, useEffect, useState } from 'react';
import { AuthRequests } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { ApiError } from '../../http';
import '../../components/account.css';

const SYSTEM_LOGIN = 'system';
const message = (error: unknown) => (error instanceof ApiError ? error.message : 'Coś poszło nie tak — spróbuj ponownie.');

export function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isSystem = email.trim().toLowerCase() === SYSTEM_LOGIN;

  // link z maila: /login?token=…
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) return;
    window.history.replaceState(null, '', '/');
    setBusy(true);
    AuthRequests.verifyLink(token)
      .then((session) => signIn(session.token, session.user))
      .catch((caught) => setError(`${message(caught)} Podaj e-mail, wyślemy nowy kod.`))
      .finally(() => setBusy(false));
  }, []);

  useEffect(() => {
    if (!sentTo) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [sentTo]);

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (isSystem) {
        const session = await AuthRequests.system(password);
        signIn(session.token, session.user);
        return;
      }
      const result = await AuthRequests.start(email);
      setSentTo(result.email);
      setCode('');
      setResendAt(Date.now() + result.resendAfterSeconds * 1000);
      setNow(Date.now());
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 429 && caught.retryAfterSeconds && !isSystem) {
        setSentTo(email.trim().toLowerCase());
        setResendAt(Date.now() + caught.retryAfterSeconds * 1000);
      }
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (event: FormEvent) => {
    event.preventDefault();
    if (!sentTo) return;
    setBusy(true);
    setError('');
    try {
      const session = await AuthRequests.verifyCode(sentTo, code);
      signIn(session.token, session.user);
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  };

  const wait = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const waitText = `${Math.floor(wait / 60)}:${String(wait % 60).padStart(2, '0')}`;

  return (
    <main className="account-page account-narrow">
      {sentTo === null ? (
        <form className="account-form" onSubmit={send}>
          <h1>Zaloguj się</h1>
          <p className="account-lead">Podaj adres e-mail. Wyślemy na niego kod i link do logowania. Jeśli nie masz konta, założymy je przy pierwszym logowaniu.</p>
          <label>
            <span>E-mail</span>
            <input type="text" inputMode="email" autoComplete="username" autoCapitalize="none" required autoFocus
              value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          {isSystem && (
            <label>
              <span>Hasło</span>
              <input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
          )}
          {error && <p className="account-error">{error}</p>}
          <div className="account-actions">
            <button type="submit" disabled={busy}>{isSystem ? 'Zaloguj' : 'Wyślij kod'}</button>
          </div>
        </form>
      ) : (
        <form className="account-form" onSubmit={verify}>
          <h1>Sprawdź pocztę</h1>
          <p className="account-lead">Wysłaliśmy kod na <strong>{sentTo}</strong>. Wpisz go poniżej albo kliknij link w mailu. Kod i link są ważne 10 minut.</p>
          <label>
            <span>Kod (6 cyfr)</span>
            <input className="account-code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required autoFocus
              value={code} onChange={(event) => setCode(event.target.value.replace(/[^\d ]/g, ''))} />
          </label>
          {error && <p className="account-error">{error}</p>}
          <div className="account-actions">
            <button type="button" className="account-cancel" disabled={busy || wait > 0} onClick={() => send()}>
              {wait > 0 ? `Wyślij ponownie (${waitText})` : 'Wyślij ponownie'}
            </button>
            <button type="submit" disabled={busy}>Zaloguj</button>
          </div>
          <p className="account-link">
            <button type="button" className="account-text-button" onClick={() => { setSentTo(null); setError(''); }}>Zmień adres e-mail</button>
          </p>
        </form>
      )}
    </main>
  );
}
