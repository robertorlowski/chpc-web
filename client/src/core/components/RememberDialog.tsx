// Pytanie po zalogowaniu kodem lub linkiem (konta użytkowników, 2026-10-11): Tak = sesja 14 dni i token
// w localStorage, Nie = do zamknięcia przeglądarki (AuthContext.answerRemember). Okno .modal z makiety.
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import './account.css';

export function RememberDialog() {
  const { answerRemember } = useAuth();
  const [busy, setBusy] = useState(false);
  const answer = (remember: boolean) => {
    setBusy(true);
    answerRemember(remember).catch(() => setBusy(false));
  };
  return (
    <div className="modal-layer">
      <div className="scrim" />
      <div className="modal modal-sm" role="dialog" aria-modal="true" aria-labelledby="remember-title">
        <header className="modal-head"><h2 id="remember-title">Zapamiętać logowanie na 14 dni?</h2></header>
        <div className="modal-body">
          <p>Tak — przez 14 dni logowanie na tym urządzeniu bez kodu z maila. Nie — po zamknięciu przeglądarki trzeba będzie zalogować się ponownie. Na wspólnym komputerze wybierz Nie.</p>
        </div>
        <footer className="modal-foot">
          <button type="button" className="btn" disabled={busy} onClick={() => answer(false)}>Nie</button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => answer(true)}>Tak</button>
        </footer>
      </div>
    </div>
  );
}
