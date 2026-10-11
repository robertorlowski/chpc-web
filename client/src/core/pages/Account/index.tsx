// „Moje dane” (/account, menu konta w nagłówku; konta użytkowników, 2026-10-11): dane i lokalizacja konta,
// zmiana e-maila (kod na nowy adres), wylogowanie i usunięcie konta (link potwierdzający w mailu).
// DeleteAccountConfirm (/account/delete?token=…) to strona z linku — działa także bez zalogowania.
import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthRequests } from '../../api';
import { ProfileForm } from '../../components/ProfileForm';
import { useAuth } from '../../context/AuthContext';
import { ApiError } from '../../http';
import '../../components/account.css';

const message = (error: unknown) => (error instanceof ApiError ? error.message : 'Coś poszło nie tak — spróbuj ponownie.');

function EmailCard({ email }: { email: string }) {
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
    <section className="account-card">
      <h2>E-mail</h2>
      {step === 'idle' && (
        <div className="account-row">
          <span className="account-email">{email}</span>
          <button type="button" onClick={() => { setStep('email'); setNewEmail(''); setDone(''); }}>Zmień</button>
        </div>
      )}
      {step === 'email' && (
        <form className="account-form" onSubmit={send}>
          <p className="account-lead">Na nowy adres wyślemy kod. Zmiana zadziała po jego wpisaniu, a na obecny adres przyjdzie powiadomienie.</p>
          <label><span>Nowy e-mail</span><input type="email" required autoFocus value={newEmail} onChange={(event) => setNewEmail(event.target.value)} /></label>
          {error && <p className="account-error">{error}</p>}
          <div className="account-actions">
            <button type="button" className="account-cancel" onClick={cancel} disabled={busy}>Anuluj</button>
            <button type="submit" disabled={busy}>Wyślij kod</button>
          </div>
        </form>
      )}
      {step === 'code' && (
        <form className="account-form" onSubmit={verify}>
          <p className="account-lead">Kod wysłany na <strong>{newEmail}</strong> (ważny 10 minut).</p>
          <label><span>Kod (6 cyfr)</span><input className="account-code" inputMode="numeric" maxLength={7} required autoFocus value={code} onChange={(event) => setCode(event.target.value.replace(/[^\d ]/g, ''))} /></label>
          {error && <p className="account-error">{error}</p>}
          <div className="account-actions">
            <button type="button" className="account-cancel" onClick={cancel} disabled={busy}>Anuluj</button>
            <button type="submit" disabled={busy}>Zmień e-mail</button>
          </div>
        </form>
      )}
      {done && <p className="account-ok">{done}</p>}
    </section>
  );
}

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
    <div className="account-backdrop" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="account-dialog" role="alertdialog" aria-labelledby="delete-title">
        <h2 id="delete-title" className="account-danger-title">Usunąć konto?</h2>
        {sent === null ? (
          <>
            <p className="account-lead">Usunięte zostaną: konto i dane osobowe, Twoje sterowniki z całą historią (pomiary, harmonogramy, ustawienia) oraz udostępnienia innym osobom.</p>
            <p className="account-warning">Tego nie da się cofnąć. Na {email} wyślemy link — konto zniknie dopiero po jego kliknięciu (ważny 10 minut).</p>
            {error && <p className="account-error">{error}</p>}
            <div className="account-actions">
              <button type="button" className="account-cancel" onClick={onClose} disabled={busy}>Anuluj</button>
              <button type="button" className="account-danger" onClick={send} disabled={busy}>Wyślij link</button>
            </div>
          </>
        ) : (
          <>
            <p className="account-lead">Wysłaliśmy link na {email}. Kliknij go w ciągu 10 minut, żeby usunąć konto{sent ? ` i ${sent} sterowników` : ''}.</p>
            <div className="account-actions"><button type="button" onClick={onClose}>OK</button></div>
          </>
        )}
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
    <main className="account-page">
      <h1>{user.isSystem ? 'Konto systemowe' : 'Moje dane'}</h1>
      {!user.isSystem && (
        <section className="account-card">
          <h2>Dane</h2>
          <ProfileForm user={user} onSaved={(updated) => { setUser(updated); setSaved(true); }} onCancel={() => navigate(-1)} />
          {saved && <p className="account-ok">Zapisano.</p>}
        </section>
      )}
      {user.email && <EmailCard email={user.email} />}
      <section className="account-card">
        <h2>Konto</h2>
        <div className="account-actions">
          {!user.isSystem && <button type="button" className="account-danger" onClick={() => setDeleting(true)}>Usuń konto</button>}
          <button type="button" onClick={() => void logout()}>Wyloguj</button>
        </div>
      </section>
      {deleting && user.email && <DeleteDialog email={user.email} onClose={() => setDeleting(false)} />}
    </main>
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
    <main className="account-page account-narrow">
      <h1>Usunięcie konta</h1>
      {state.done === undefined && !state.error && <p className="account-lead">Usuwanie…</p>}
      {state.done !== undefined && <p className="account-lead">Konto i wszystkie dane zostały usunięte{state.done ? ` (sterowniki: ${state.done})` : ''}.</p>}
      {state.error && <p className="account-error">{state.error}</p>}
      <div className="account-actions"><a className="account-button-link" href="/">Strona logowania</a></div>
    </main>
  );
}
