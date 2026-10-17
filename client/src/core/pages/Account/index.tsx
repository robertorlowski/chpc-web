// „Moje dane” (/account, menu konta w nagłówku; konta użytkowników, 2026-10-11) w wyglądzie „Instrument” z makiet/
// (#s-konto, 2026-10-17): karty „Moje dane” (e-mail ze zmianą przez kod na nowy adres, dane i lokalizacja konta —
// ProfileForm), „Sesja” (wylogowanie) i czerwona „Usunięcie konta” (.card-danger; link potwierdzający w mailu,
// okno .modal). DeleteAccountConfirm (/account/delete?token=…) to strona z linku — działa także bez zalogowania.
import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthRequests } from '../../api';
import { ProfileForm } from '../../components/ProfileForm';
import { useAuth, userDisplayName } from '../../context/AuthContext';
import { ApiError } from '../../http';
import '../../components/account.css';

const message = (error: unknown) => (error instanceof ApiError ? error.message : 'Coś poszło nie tak — spróbuj ponownie.');

const ErrorAlert = ({ text }: { text: string }) => (
  <div className="alert alert-err" role="alert"><div><strong>{text}</strong></div></div>
);

// Wiersz „E-mail” karty „Moje dane”: adres i link „zmień”, który rozwija pod wierszem kroki nowy adres → kod.
function EmailRow({ email }: { email: string }) {
  const { setUser } = useAuth();
  const [step, setStep] = useState<'idle' | 'email' | 'code'>('idle');
  const [newEmail, setNewEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  const cancel = () => { setStep('idle'); setError(''); setCode(''); };
  const send = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await AuthRequests.changeEmail(newEmail);
      setStep('code');
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  };
  const verify = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const user = await AuthRequests.verifyEmail(code);
      setUser(user);
      setDone(`Adres zmieniony na ${user.email}. Na poprzedni wysłaliśmy powiadomienie.`);
      cancel();
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <dl className="kv">
        <div>
          <dt>E-mail</dt>
          <dd>
            {email}{' '}
            {step === 'idle' && <button type="button" className="link-btn" onClick={() => { setStep('email'); setNewEmail(''); setDone(''); }}>zmień</button>}
          </dd>
        </div>
      </dl>
      {step === 'email' && (
        <form className="auth-step account-inline" onSubmit={send}>
          <p className="help">Na nowy adres wyślemy kod. Zmiana zadziała po jego wpisaniu, a na obecny adres przyjdzie powiadomienie.</p>
          <label className="field"><span>Nowy e-mail</span><input type="email" required autoFocus value={newEmail} onChange={(event) => setNewEmail(event.target.value)} /></label>
          {error && <ErrorAlert text={error} />}
          <div className="actions actions-gap">
            <button type="button" className="btn" onClick={cancel} disabled={busy}>Anuluj</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>Wyślij kod</button>
          </div>
        </form>
      )}
      {step === 'code' && (
        <form className="auth-step account-inline" onSubmit={verify}>
          <p className="help">Kod wysłany na <strong>{newEmail}</strong> (ważny 10 minut).</p>
          <label className="field"><span>Kod z maila</span><input className="code" inputMode="numeric" maxLength={7} required autoFocus placeholder="6 cyfr" value={code} onChange={(event) => setCode(event.target.value.replace(/[^\d ]/g, ''))} /></label>
          {error && <ErrorAlert text={error} />}
          <div className="actions actions-gap">
            <button type="button" className="btn" onClick={cancel} disabled={busy}>Anuluj</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>Zmień e-mail</button>
          </div>
        </form>
      )}
      {done && <div className="toast toast-ok">{done}</div>}
    </>
  );
}

// Okno „Usunąć konto?” (.modal z makiety): wysyła link potwierdzający na e-mail konta.
function DeleteDialog({ email, onClose }: { email: string; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState<number | null>(null);
  const send = async () => {
    setBusy(true);
    setError('');
    try {
      setSent((await AuthRequests.deleteAccount()).devices);
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal-layer">
      <div className="scrim" onClick={onClose} />
      <div className="modal modal-sm" role="alertdialog" aria-modal="true" aria-labelledby="delete-title">
        <header className="modal-head"><h2 id="delete-title">Usunąć konto?</h2></header>
        <div className="modal-body">
          {sent === null ? (
            <>
              <p>Usunięte zostaną: konto i dane osobowe, Twoje sterowniki z całą historią (pomiary, harmonogramy, ustawienia) oraz udostępnienia innym osobom.</p>
              <p>Tego nie da się cofnąć. Wyślemy link potwierdzający na <strong>{email}</strong> — konto zniknie dopiero po jego kliknięciu (ważny 10 minut).</p>
              {error && <ErrorAlert text={error} />}
            </>
          ) : (
            <p>Wysłaliśmy link na <strong>{email}</strong>. Kliknij go w ciągu 10 minut, żeby usunąć konto{sent ? ` i ${sent} sterowników` : ''}.</p>
          )}
        </div>
        <footer className="modal-foot">
          {sent === null ? (
            <>
              <button type="button" className="btn" onClick={onClose} disabled={busy}>Anuluj</button>
              <button type="button" className="btn btn-danger" onClick={send} disabled={busy}>Wyślij link</button>
            </>
          ) : (
            <button type="button" className="btn btn-primary" onClick={onClose}>OK</button>
          )}
        </footer>
      </div>
    </div>
  );
}

export function Account() {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(() => new URLSearchParams(window.location.search).has('delete'));
  const [saved, setSaved] = useState(false);
  if (!user) return null;

  return (
    <div className="page page-narrow account-page">
      <section className="card">
        <header className="card-head"><h2>{user.isSystem ? 'Konto systemowe' : 'Moje dane'}</h2><span className="card-hint">{userDisplayName(user)}</span></header>
        {user.email && <EmailRow email={user.email} />}
        {!user.isSystem && (
          <ProfileForm user={user} onSaved={(updated) => { setUser(updated); setSaved(true); }} onCancel={() => navigate(-1)} />
        )}
        {saved && <div className="toast toast-ok">Zapisano.</div>}
        {user.isSystem && <p className="help">Użytkownik systemowy: logowanie hasłem, widzi wszystkie sterowniki i zmienia wzór kafelka oraz firmware.</p>}
      </section>

      <section className="card">
        <header className="card-head"><h2>Sesja</h2></header>
        <p className="help">Zapamiętane logowanie („Tak” po zalogowaniu kodem) trwa 14 dni na tym urządzeniu; bez zapamiętania do zamknięcia przeglądarki. Wylogowanie kończy sesję na tym urządzeniu.</p>
        <div className="actions"><button type="button" className="btn btn-ghost" onClick={() => void logout()}>Wyloguj</button></div>
      </section>

      {!user.isSystem && (
        <section className="card card-danger">
          <header className="card-head"><h2>Usunięcie konta</h2></header>
          <p className="help">Usuwa konto, dane osobowe, układ kafelków, udostępnienia i Twoje sterowniki z całą historią. Potwierdzenie przychodzi mailem.</p>
          <div className="actions"><button type="button" className="btn btn-danger-ghost" onClick={() => setDeleting(true)}>Usuń konto…</button></div>
        </section>
      )}
      {deleting && user.email && <DeleteDialog email={user.email} onClose={() => setDeleting(false)} />}
    </div>
  );
}

// Strona z linku w mailu: kliknięcie linku jest potwierdzeniem (decyzja 2026-10-11), usunięcie od razu.
export function DeleteAccountConfirm() {
  const { logout } = useAuth();
  const [state, setState] = useState<{ done?: number; error?: string }>({});
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token') ?? '';
    AuthRequests.confirmDelete(token)
      .then((result) => {
        setState({ done: result.devices });
        void logout();
      })
      .catch((caught) => setState({ error: message(caught) }));
  }, []);
  return (
    <div className="auth">
      <div className="auth-card">
        <div className="brand brand-big"><span className="brand-mark" /><span className="brand-name">CHPC</span></div>
        <h1>Usunięcie konta</h1>
        {state.done === undefined && !state.error && <p className="help">Usuwanie…</p>}
        {state.done !== undefined && <p className="help">Konto i wszystkie dane zostały usunięte{state.done ? ` (sterowniki: ${state.done})` : ''}.</p>}
        {state.error && <ErrorAlert text={state.error} />}
        <a className="btn btn-primary btn-block" href="/">Strona logowania</a>
      </div>
    </div>
  );
}
