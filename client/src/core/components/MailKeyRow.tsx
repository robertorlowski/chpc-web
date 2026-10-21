// Wiersz „Poczta” w karcie „Sterownik” (ControllerCard) włącznika i pompy ciepła (przekaźnik poczty, 2026-10-17):
// odcisk klucza płytki i stan (zatwierdzony / czeka / brak). Klucz zatwierdza tylko użytkownik systemowy, po
// porównaniu odcisku z odciskiem na stronie /install płytki — bez zatwierdzenia płytka nie dostaje danych SMTP
// ani maili (server/src/core/services/mail-relay.service.ts). Dane z GET /api/devices (useCurrentDevice).
import { useState } from 'react';
import { DeviceRequests } from '../api';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../http';
import { Device } from '../types';
import { useLang } from '../i18n';

// jak RELAY_ALIVE_MS na serwerze (płytka pyta o maile co 60 s)
const RELAY_ALIVE_MS = 150_000;

export const MailKeyRow: React.FC<{ current: Device | null; reload: () => void }> = ({ current, reload }) => {
  const { user } = useAuth();
  const { t } = useLang();
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
      setError(caught instanceof ApiError ? caught.message : t('common.somethingWrong'));
    } finally {
      setBusy(false);
    }
  };

  const approve = () => {
    const fingerprint = key.pendingFingerprint;
    if (!fingerprint) return;
    if (!window.confirm(t('mailKey.approveConfirm', { fingerprint }))) return;
    void run(() => DeviceRequests.approveMailKey(current.rootId, fingerprint));
  };

  const revoke = () => {
    if (!window.confirm(t('mailKey.revokeConfirm'))) return;
    void run(() => DeviceRequests.revokeMailKey(current.rootId));
  };

  return (
    <div>
      <dt>{t('mailKey.title')}</dt>
      <dd>
        {key.fingerprint ? (
          <>
            <code title={t('mailKey.approvedFingerprint')}>{key.fingerprint}</code>
            <span className={`chip ${online ? 'chip-ok' : 'chip-off'}`}>{online ? t('mailKey.sending') : t('mailKey.approved')}</span>
            {isSystem && <button type="button" className="link-btn" disabled={busy} onClick={revoke}>{t('common.remove')}</button>}
          </>
        ) : !key.pendingFingerprint ? (
          <span>{t('mailKey.noFirmware')}</span>
        ) : null}
        {key.pendingFingerprint && (
          <>
            {key.fingerprint && <br />}
            <code title={t('mailKey.newFingerprint')}>{key.pendingFingerprint}</code>
            <span className="chip chip-warn">{t('mailKey.pending')}</span>
            {isSystem && <button type="button" className="link-btn" disabled={busy} onClick={approve}>{t('mailKey.approve')}</button>}
          </>
        )}
        {!key.relayEnabled && <small>{t('mailKey.relayOff')}</small>}
        {error && <small className="danger-text">{error}</small>}
      </dd>
    </div>
  );
};
