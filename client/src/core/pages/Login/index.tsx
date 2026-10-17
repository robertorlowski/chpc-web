// Logowanie i rejestracja (konta użytkowników, 2026-10-11) w wyglądzie „Instrument” z makiet/ (#s-logowanie, 2026-10-17):
// karta .auth-card z marką, kroki e-mail → kod z maila (6 cyfr, 10 min, 5 prób, nowy kod po 60 s) albo link z maila
// (/login?token=…). Wpisanie „system” zamiast e-maila pokazuje pole hasła (użytkownik systemowy; bez osobnego linku).
// Logika w AuthContext (signIn), żądania w AuthRequests; style w components/account.css.
import { FormEvent, useEffect, useState } from 'react';
import { AuthRequests } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { ApiError } from '../../http';
import '../../components/account.css';

const SYSTEM_LOGIN = 'system';
const message = (error: unknown) => (error instanceof ApiError ? error.message : 'Coś poszło nie tak — spróbuj ponownie.');

const ErrorAlert = ({ text }: { text: string }) => (
  <div className="alert alert-err" role="alert"><div><strong>{text}</strong></div></div>
);

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
    <div className="auth">
      <div className="auth-card">
        <div className="brand brand-big"><span className="brand-mark" /><span className="brand-name">My Home</span></div>
        <h1>Zaloguj się</h1>
        {sentTo === null ? (
          <form className="auth-step" onSubmit={send}>
            <p className="help">Podaj adres e-mail. Wyślemy kod i link do logowania. Jeśli nie masz konta, założymy je przy pierwszym logowaniu.</p>
            <label className="field">
              <span>E-mail</span>
              <input type="text" inputMode="email" autoComplete="username" autoCapitalize="none" required autoFocus placeholder="imie@domena.pl"
                value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            {isSystem && (
              <label className="field">
                <span>Hasło</span>
                <input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
              </label>
            )}
            {error && <ErrorAlert text={error} />}
            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>{isSystem ? 'Zaloguj' : 'Wyślij kod'}</button>
          </form>
        ) : (
          <form className="auth-step" onSubmit={verify}>
            <p className="help">Kod wysłany na <strong>{sentTo}</strong>. Wpisz go poniżej albo kliknij link w mailu. Ważny 10 minut.</p>
            <label className="field">
              <span>Kod z maila</span>
              <input className="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required autoFocus placeholder="6 cyfr"
                value={code} onChange={(event) => setCode(event.target.value.replace(/[^\d ]/g, ''))} />
            </label>
            {error && <ErrorAlert text={error} />}
            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>Zaloguj</button>
            <div className="auth-links">
              <button type="button" className="link-btn" disabled={busy || wait > 0} onClick={() => send()}>
                {wait > 0 ? `Wyślij ponownie (${waitText})` : 'Wyślij kod ponownie'}
              </button>
              <button type="button" className="link-btn" onClick={() => { setSentTo(null); setError(''); }}>Inny adres e-mail</button>
            </div>
          </form>
        )}
        <p className="auth-foot">Logowanie „system” pokazuje pole hasła (użytkownik systemowy).</p>
      </div>
    </div>
  );
}
