// Pytanie po zalogowaniu kodem lub linkiem (konta użytkowników, 2026-10-11): Tak = sesja 7 dni i token
// w localStorage, Nie = do zamknięcia przeglądarki (AuthContext.answerRemember).
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
    <div className="account-backdrop">
      <div className="account-dialog" role="dialog" aria-labelledby="remember-title">
        <h2 id="remember-title">Zapamiętać Twoje dane na tym komputerze/przeglądarce na najbliższe 7 dni?</h2>
        <p className="account-lead">Tak — przez 7 dni logowanie bez kodu z maila. Nie — po zamknięciu przeglądarki trzeba będzie zalogować się ponownie. Na wspólnym komputerze wybierz Nie.</p>
        <div className="account-actions">
          <button type="button" className="account-cancel" disabled={busy} onClick={() => answer(false)}>Nie</button>
          <button type="button" disabled={busy} onClick={() => answer(true)}>Tak</button>
        </div>
      </div>
    </div>
  );
}
