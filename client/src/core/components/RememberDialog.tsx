// Pytanie po zalogowaniu kodem lub linkiem (konta użytkowników, 2026-10-11): Tak = sesja 90 dni i token
// w localStorage, Nie = do zamknięcia przeglądarki (AuthContext.answerRemember). Okno .modal z makiety.
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../i18n';
import './account.css';

export function RememberDialog() {
  const { answerRemember } = useAuth();
  const { t } = useLang();
  const [busy, setBusy] = useState(false);
  const answer = (remember: boolean) => {
    setBusy(true);
    answerRemember(remember).catch(() => setBusy(false));
  };
  return (
    <div className="modal-layer">
      <div className="scrim" />
      <div className="modal modal-sm" role="dialog" aria-modal="true" aria-labelledby="remember-title">
        <header className="modal-head"><h2 id="remember-title">{t('remember.title')}</h2></header>
        <div className="modal-body">
          <p>{t('remember.text')}</p>
        </div>
        <footer className="modal-foot">
          <button type="button" className="btn" disabled={busy} onClick={() => answer(false)}>{t('common.no')}</button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => answer(true)}>{t('common.yes')}</button>
        </footer>
      </div>
    </div>
  );
}
