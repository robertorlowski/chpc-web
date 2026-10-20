// Karta „Udostępnianie” w Ustawieniach sterownika (konta użytkowników, 2026-10-11) w wyglądzie „Instrument”
// (makieta #s-hp-ustawienia: .card z .card-head i przyciskiem „Udostępnij”, lista .people z awatarem, e-mailem
// i zakładkami, ikony zmiany zakładek i cofnięcia dostępu). Okno „Udostępnij sterownik” (.modal: e-mail i zakładki
// rodzaju sterownika jako .checks) służy też do zmiany zakładek. Rodzaje z kafelkiem prostym (SimpleTile w rejestrze,
// np. włącznik) mają wybór „Pełna aplikacja” / „Panel prosty” (tabs: ['simple'] — osoba widzi tylko kafelek z dużymi
// przyciskami, bez widoków sterownika). Tylko właściciel i użytkownik systemowy (osoba z udostępnieniem karty nie
// widzi; serwer też odmawia). Do wstawienia w .stack / .grid-settings.
import { FormEvent, useEffect, useState } from 'react';
import { ShareRequests } from '../api';
import { getDeviceTypeView } from '../device-types';
import { ApiError } from '../http';
import { Device, DeviceShare } from '../types';
import { IconButton } from './IconButton';
import { EditIcon, TrashIcon } from './icons';
import './account.css';

const formatDate = (iso: string) => new Date(iso).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' });
// udostępnienie „Panel prosty” (serwer: access.service SIMPLE_TAB)
const SIMPLE_TAB = 'simple';
const isSimpleShare = (tabs: string[]) => tabs.includes(SIMPLE_TAB);

// „AK” z imienia i nazwiska albo z e-maila do kółka przy osobie
function initials(name: string | null, email: string): string {
  const source = name?.trim() || email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return (parts.length >= 2 ? parts[0][0] + parts[1][0] : source.slice(0, 2)).toUpperCase();
}

function ShareDialog({ device, share, onClose, onSaved }: {
  device: Device; share: DeviceShare | null; onClose: () => void; onSaved: () => void;
}) {
  const typeView = getDeviceTypeView(device.deviceType);
  const views = typeView.views;
  const simpleAvailable = !!typeView.SimpleTile;
  const [email, setEmail] = useState(share?.email ?? '');
  const [tabs, setTabs] = useState<string[]>(share && !isSimpleShare(share.tabs) ? share.tabs : views.filter((view) => ['/', '/data', '/chart'].includes(view.path)).map((view) => view.path));
  // „Pełna aplikacja” (zakładki) albo „Panel prosty” (sam kafelek z dużymi przyciskami)
  const [simple, setSimple] = useState(!!share && isSimpleShare(share.tabs));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const toggle = (path: string) => setTabs((current) => (current.includes(path) ? current.filter((tab) => tab !== path) : [...current, path]));
  const chosen = simple ? [SIMPLE_TAB] : tabs;

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (share) await ShareRequests.update(device.rootId, share.id, chosen);
      else await ShareRequests.add(device.rootId, email, chosen);
      onSaved();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Nie udało się zapisać.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-layer">
      <div className="scrim" onClick={onClose} />
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby="share-title" onSubmit={save}>
        <header className="modal-head"><h2 id="share-title">{share ? 'Zakładki' : 'Udostępnij sterownik'}</h2></header>
        <div className="modal-body">
          <p>{device.name || device.deviceId}</p>
          <label className="field">
            <span>E-mail osoby</span>
            <input type="email" required disabled={!!share} autoFocus={!share} placeholder="imie@domena.pl" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          {simpleAvailable && (
            <fieldset className="checks">
              <legend>Co zobaczy</legend>
              <label className="check">
                <input type="radio" name="share-kind" checked={!simple} onChange={() => setSimple(false)} />
                <span>Pełna aplikacja</span><small>zakładki do wyboru niżej</small>
              </label>
              <label className="check">
                <input type="radio" name="share-kind" checked={simple} onChange={() => setSimple(true)} />
                <span>Panel prosty</span><small>jeden kafelek z dużymi przyciskami: Włącz / Wyłącz / harmonogram, z opisem, co się stanie; bez wykresów, harmonogramu i ustawień</small>
              </label>
            </fieldset>
          )}
          {!simple && (
            <fieldset className="checks">
              <legend>Zakładki, które zobaczy</legend>
              {views.map((view) => (
                <label key={view.path} className="check">
                  <input type="checkbox" checked={tabs.includes(view.path)} onChange={() => toggle(view.path)} />
                  <span>{view.path === '/' ? 'Podgląd' : view.label}</span>
                </label>
              ))}
            </fieldset>
          )}
          {!share && <p className="help">Jeśli ta osoba nie ma konta, dostanie zaproszenie mailem; dostęp można cofnąć w każdej chwili.</p>}
          {error && <div className="alert alert-err" role="alert"><div><strong>{error}</strong></div></div>}
        </div>
        <footer className="modal-foot">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Anuluj</button>
          <button type="submit" className="btn btn-primary" disabled={busy || chosen.length === 0}>{share ? 'Zapisz' : 'Wyślij zaproszenie'}</button>
        </footer>
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
  const tabsText = (share: DeviceShare) => isSimpleShare(share.tabs) ? 'panel prosty (kafelek z dużymi przyciskami)'
    : share.tabs.length === views.views.length ? 'wszystkie zakładki' : share.tabs.map(tabLabel).join(', ');

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
    <section className="card">
      <header className="card-head controller-card-head">
        <h2>Udostępnianie</h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>Udostępnij</button>
      </header>
      {shares && shares.length > 0 && (
        <ul className="people">
          {shares.map((share) => (
            <li key={share.id}>
              <span className="avatar-sm" aria-hidden="true">{initials(share.name, share.email)}</span>
              <span className="person">
                <strong>{share.registered ? share.name || share.email : share.email}</strong>
                {share.registered && share.name && <small>{share.email}</small>}
                <small className={share.registered ? '' : 'share-pending'}>
                  {share.registered ? tabsText(share) : `zaproszenie wysłane ${formatDate(share.createdAt)} · czeka na rejestrację · ${tabsText(share)}`}
                </small>
              </span>
              <IconButton label={`Zmień zakładki: ${share.email}`} icon={<EditIcon />} onClick={() => setEditing(share)} />
              <IconButton variant="danger" label={`Cofnij dostęp: ${share.email}`} icon={<TrashIcon />} onClick={() => void remove(share)} />
            </li>
          ))}
        </ul>
      )}
      {shares?.length === 0 && <p className="help">Nikt poza Tobą nie ma dostępu. „Udostępnij” wysyła zaproszenie na e-mail z wybranymi zakładkami.</p>}
      {error && <div className="alert alert-err" role="alert"><div><strong>{error}</strong></div></div>}
      {editing !== undefined && (
        <ShareDialog device={device} share={editing} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); void load(); }} />
      )}
    </section>
  );
}
