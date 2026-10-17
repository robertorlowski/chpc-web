// Wiersz „Poczta” w karcie „Sterownik” (ControllerCard) włącznika i pompy ciepła (przekaźnik poczty, 2026-10-17):
// odcisk klucza płytki i stan (zatwierdzony / czeka / brak). Klucz zatwierdza tylko użytkownik systemowy, po
// porównaniu odcisku z odciskiem na stronie /install płytki — bez zatwierdzenia płytka nie dostaje danych SMTP
// ani maili (server/src/core/services/mail-relay.service.ts). Dane z GET /api/devices (useCurrentDevice).
import { useState } from 'react';
import { DeviceRequests } from '../api';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../http';
import { Device } from '../types';

// jak RELAY_ALIVE_MS na serwerze (płytka pyta o maile co 60 s)
const RELAY_ALIVE_MS = 150_000;

export const MailKeyRow: React.FC<{ current: Device | null; reload: () => void }> = ({ current, reload }) => {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const key = current?.mailKey;
  if (!current || !key) return null;
  const isSystem = !!user?.isSystem;
  const online = !!key.seenAt && Date.now() - new Date(key.seenAt).getTime() < RELAY_ALIVE_MS;

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await action();
      reload();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Nie udało się — spróbuj ponownie.');
    } finally {
      setBusy(false);
    }
  };

  const approve = () => {
    const fingerprint = key.pendingFingerprint;
    if (!fingerprint) return;
    if (!window.confirm(`Zatwierdzić klucz ${fingerprint}?\n\nPorównaj go z odciskiem na stronie /install płytki. Płytka dostanie dane poczty i będzie wysyłać maile z kodami logowania.`)) return;
    void run(() => DeviceRequests.approveMailKey(current.rootId, fingerprint));
  };

  const revoke = () => {
    if (!window.confirm('Usunąć klucz? Płytka przestanie wysyłać maile do czasu zatwierdzenia nowego klucza.')) return;
    void run(() => DeviceRequests.revokeMailKey(current.rootId));
  };

  return (
    <div>
      <dt>Poczta</dt>
      <dd>
        {key.fingerprint ? (
          <>
            <code title="Odcisk zatwierdzonego klucza płytki">{key.fingerprint}</code>
            <span className={`chip ${online ? 'chip-ok' : 'chip-off'}`}>{online ? 'wysyła' : 'zatwierdzony'}</span>
            {isSystem && <button type="button" className="link-btn" disabled={busy} onClick={revoke}>usuń</button>}
          </>
        ) : !key.pendingFingerprint ? (
          <span>— (firmware bez wysyłki poczty)</span>
        ) : null}
        {key.pendingFingerprint && (
          <>
            {key.fingerprint && <br />}
            <code title="Odcisk nowego klucza płytki">{key.pendingFingerprint}</code>
            <span className="chip chip-warn">czeka na zatwierdzenie</span>
            {isSystem && <button type="button" className="link-btn" disabled={busy} onClick={approve}>zatwierdź</button>}
          </>
        )}
        {!key.relayEnabled && <small>wysyłka przez sterowniki wyłączona na serwerze (MAIL_RELAY)</small>}
        {error && <small className="danger-text">{error}</small>}
      </dd>
    </div>
  );
};
