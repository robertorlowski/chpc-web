// Karta „Udostępnianie” w Ustawieniach sterownika (konta użytkowników, 2026-10-11): osoby z dostępem i ich
// zakładki, okno „Udostępnij” (e-mail i zakładki rodzaju sterownika), zmiana zakładek i odebranie dostępu.
// Tylko właściciel i użytkownik systemowy (osoba z udostępnieniem karty nie widzi; serwer też odmawia).
import { FormEvent, useEffect, useState } from 'react';
import { ShareRequests } from '../api';
import { getDeviceTypeView } from '../device-types';
import { ApiError } from '../http';
import { Device, DeviceShare } from '../types';
import './account.css';

const formatDate = (iso: string) => new Date(iso).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' });

function ShareDialog({ device, share, onClose, onSaved }: {
  device: Device; share: DeviceShare | null; onClose: () => void; onSaved: () => void;
}) {
  const views = getDeviceTypeView(device.deviceType).views;
  const [email, setEmail] = useState(share?.email ?? '');
  const [tabs, setTabs] = useState<string[]>(share?.tabs ?? views.filter((view) => ['/', '/data', '/chart'].includes(view.path)).map((view) => view.path));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const toggle = (path: string) => setTabs((current) => (current.includes(path) ? current.filter((tab) => tab !== path) : [...current, path]));

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (share) await ShareRequests.update(device.rootId, share.id, tabs);
      else await ShareRequests.add(device.rootId, email, tabs);
      onSaved();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Nie udało się zapisać.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="account-backdrop" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <form className="account-dialog account-form" role="dialog" aria-labelledby="share-title" onSubmit={save}>
        <h2 id="share-title">{share ? 'Zakładki' : 'Udostępnij'} „{device.name || device.deviceId}”</h2>
        <label>
          <span>E-mail osoby</span>
          <input type="email" required disabled={!!share} autoFocus={!share} value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <fieldset className="share-tabs">
          <legend>Zakładki, które zobaczy</legend>
          {views.map((view) => (
            <label key={view.path} className="share-tab">
              <input type="checkbox" checked={tabs.includes(view.path)} onChange={() => toggle(view.path)} />
              {view.path === '/' ? 'Podgląd' : view.label}
            </label>
          ))}
        </fieldset>
        {!share && <p className="account-lead">Jeśli ta osoba nie ma konta, dostanie zaproszenie mailem.</p>}
        {error && <p className="account-error">{error}</p>}
        <div className="account-actions">
          <button type="button" className="account-cancel" onClick={onClose} disabled={busy}>Anuluj</button>
          <button type="submit" disabled={busy || tabs.length === 0}>{share ? 'Zapisz' : 'Udostępnij'}</button>
        </div>
      </form>
    </div>
  );
}

export function DeviceSharing({ device }: { device: Device }) {
  const [shares, setShares] = useState<DeviceShare[] | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<DeviceShare | null | undefined>(undefined);
  const views = getDeviceTypeView(device.deviceType);
  const tabLabel = (path: string) => (path === '/' ? 'Podgląd' : views.views.find((view) => view.path === path)?.label ?? path);

  const load = () => ShareRequests.list(device.rootId).then(setShares).catch((caught) => setError(caught instanceof ApiError ? caught.message : 'Nie udało się pobrać listy.'));
  useEffect(() => { void load(); }, [device.rootId]);
  if (device.access === 'shared') return null;

  const remove = async (share: DeviceShare) => {
    if (!window.confirm(`Odebrać dostęp: ${share.name ?? share.email}?`)) return;
    try {
      await ShareRequests.remove(device.rootId, share.id);
      void load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Nie udało się odebrać dostępu.');
    }
  };

  return (
    <section className="account-card share-card">
      <h2>Udostępnianie</h2>
      <p className="account-lead">Osoby z dostępem do tego sterownika i zakładki, które widzą.</p>
      {shares?.map((share) => (
        <div key={share.id} className="share-row">
          <div className="share-who">
            <strong>{share.registered ? share.name || share.email : `Zaproszenie wysłane ${formatDate(share.createdAt)}`}</strong>
            <span>{share.email}</span>
            <span className={share.registered ? '' : 'share-pending'}>
              {share.tabs.map(tabLabel).join(', ')}{share.registered ? '' : ' — czeka na rejestrację'}
            </span>
          </div>
          <button type="button" className="share-icon" aria-label={`Zmień zakładki: ${share.email}`} title="Zmień zakładki" onClick={() => setEditing(share)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 20l4-1 11-11-3-3L5 16z" /></svg>
          </button>
          <button type="button" className="share-icon share-remove" aria-label={`Odbierz dostęp: ${share.email}`} title="Odbierz dostęp" onClick={() => void remove(share)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>
          </button>
        </div>
      ))}
      {shares?.length === 0 && <p className="account-lead">Nikt poza Tobą nie ma dostępu.</p>}
      {error && <p className="account-error">{error}</p>}
      <div className="account-actions">
        <button type="button" onClick={() => setEditing(null)}>Udostępnij</button>
      </div>
      {editing !== undefined && (
        <ShareDialog device={device} share={editing} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); void load(); }} />
      )}
    </section>
  );
}
