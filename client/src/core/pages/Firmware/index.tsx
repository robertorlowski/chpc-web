// Strona /firmware/:deviceType: firmware rodzaju sterownika (trybik na kafelku sterownika na liście /devices),
// wygląd „Instrument” z makiet/ (ekrany #s-firmware-*, 2026-10-17). Karty: „Aktualna wersja” (oferowana wersja, opis,
// data, rozmiar, SHA-256, przełącznik „Aktualizacje”, plus otwiera kartę „Dodaj wersję”), „Sterowniki tego rodzaju”
// (wersja z ostatniego zgłoszenia każdego sterownika, GET /api/devices), „Poprzednie wersje” (przywrócenie, usunięcie)
// i „Dodaj wersję” (plik .bin, wersja, opis; PUT /api/firmware/:rodzaj/:wersja). Oferta i pliki dotyczą wszystkich
// sterowników danego rodzaju, ale sterownik pobiera plik dopiero po „Aktualizuj” w swoich Ustawieniach
// (components/FirmwareStatus). Poza kontekstem urządzenia (bez rootId).
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DeviceRequests, FirmwareRequests } from '../../api';
import { InfoTip } from '../../components/InfoTip';
import { Device, DeviceType, FirmwareImage, FirmwareSummary } from '../../types';
import { getDeviceTypeView } from '../../device-types';
import Notification, { useSaveNotice } from '../../components/Notification';
import { IconButton } from '../../components/IconButton';
import { PlusIcon, TrashIcon } from '../../components/icons';
import './style.css';

// partycja aplikacji OTA ESP32; serwer odrzuca większy plik (core/services/firmware.service.ts)
const MAX_FIRMWARE_BYTES = 1310720;
const MAX_DESCRIPTION_LENGTH = 500;

const formatBytes = (bytes: number) => `${bytes.toLocaleString('pl-PL')} B`;
const formatDate = (value?: string) => (value ? new Date(value).toLocaleDateString('pl-PL') : '---');
const formatDateTime = (value?: string) =>
  value ? new Date(value).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' }) : '---';
const shortSha = (sha: string) => `${sha.slice(0, 4)}…${sha.slice(-4)}`;

// Przełącznik jak w makiecie (.switch): span z rolą switch, Enter/spacja przełączają.
const Switch: React.FC<{ on: boolean; label: string; disabled?: boolean; onChange: (on: boolean) => void }> = ({ on, label, disabled, onChange }) => (
  <span className={`switch${on ? ' is-on' : ''}${disabled ? ' is-disabled' : ''}`} role="switch" aria-checked={on} aria-label={label}
    aria-disabled={disabled || undefined} tabIndex={disabled ? -1 : 0} title={label}
    onClick={() => !disabled && onChange(!on)}
    onKeyDown={(event) => { if (!disabled && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onChange(!on); } }} />
);

// Stan sterownika względem oferowanej wersji (chip na liście „Sterowniki tego rodzaju”).
function deviceChip(device: Device, offered: string | null, enabled: boolean): { className: string; text: string } {
  if (device.firmwareUpdate) return { className: 'chip-warn', text: 'zlecona' };
  if (!device.firmwareVersion) return { className: 'chip-off', text: 'brak wersji' };
  if (offered && enabled && device.firmwareVersion !== offered) return { className: 'chip-warn', text: 'do aktualizacji' };
  return { className: 'chip-ok', text: 'aktualny' };
}

export const Firmware: React.FC = () => {
  const { deviceType } = useParams();
  const type = Object.values(DeviceType).find((value) => value === deviceType);
  const view = type ? getDeviceTypeView(type) : undefined;
  const supported = view?.firmwareUpdates === true;

  const [summary, setSummary] = useState<FirmwareSummary | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [version, setVersion] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [sha, setSha] = useState('');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const addCard = useRef<HTMLFormElement>(null);
  // przyciski zmian nieaktywne, dopóki widać komunikat o poprzedniej zmianie (useSaveNotice)
  const { notice, showNotice, busy: noticeBusy } = useSaveNotice(4000);
  const say = (message: string) => showNotice(message);

  const closeAdd = () => {
    setAdding(false);
    setFile(null);
    setSha('');
    setVersion('');
    setDescription('');
    setError('');
    setFileKey((key) => key + 1);
  };

  useEffect(() => {
    if (!adding) return;
    addCard.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeAdd();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [adding]);

  useEffect(() => {
    if (!type || !supported) return;
    FirmwareRequests.get(type).then((result) => {
      if (result) setSummary(result);
      else setError('Nie udało się pobrać stanu firmware.');
    });
    DeviceRequests.getDevices().then((list) => setDevices((list ?? []).filter((device) => device.deviceType === type)));
  }, [type, supported]);

  if (!type || !supported) {
    return (
      <div className="page page-narrow firmware-page">
        <div className="empty">
          <h2>Firmware</h2>
          <p>Ten rodzaj sterownika nie ma aktualizacji firmware przez sieć.</p>
          <Link className="link" to="/devices">Lista sterowników</Link>
        </div>
      </div>
    );
  }

  const active = summary?.images.find((image) => image.active);
  const previous = summary?.images.filter((image) => !image.active) ?? [];
  const enabled = summary?.enabled ?? false;

  // Suma SHA-256 policzona w przeglądarce jest tylko podglądem; wiążąca jest ta z serwera.
  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.currentTarget.files?.[0] ?? null;
    setFile(chosen);
    setSha('');
    setError('');
    if (!chosen) return;
    if (chosen.size > MAX_FIRMWARE_BYTES) {
      setError(`Plik jest za duży: ${formatBytes(chosen.size)}, limit ${formatBytes(MAX_FIRMWARE_BYTES)}.`);
      return;
    }
    // wersja z nazwy pliku (water-pressure-tank-1.0.1.bin), gdy pole jest puste
    const fromName = chosen.name.match(/(\d+(?:\.\d+)+)/)?.[1];
    if (fromName && !version.trim()) setVersion(fromName);
    try {
      const digest = await crypto.subtle.digest('SHA-256', await chosen.arrayBuffer());
      setSha(Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join(''));
    } catch {
      // brak crypto.subtle (np. http w sieci lokalnej): sumę policzy serwer
    }
  };

  const run = async (action: () => Promise<FirmwareSummary>, done?: string) => {
    setError('');
    try {
      setSummary(await action());
      if (done) say(done);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Operacja nie powiodła się.');
      return false;
    }
  };

  const upload = async (event: FormEvent) => {
    event.preventDefault();
    if (!file || !version.trim()) return;
    setBusy(true);
    const ok = await run(
      () => FirmwareRequests.upload(type, version.trim(), file, description.trim()),
      'Plik zapisany i ustawiony jako oferowany. Sterownik pobierze go po „Aktualizuj” w jego Ustawieniach.',
    );
    setBusy(false);
    if (ok) closeAdd();
  };

  const remove = (image: FirmwareImage) => {
    if (!window.confirm(`Usunąć wersję ${image.version}? Pliku nie da się odzyskać.`)) return;
    run(() => FirmwareRequests.remove(type, image.version), `Usunięto wersję ${image.version}.`);
  };

  return (
    <div className="page page-narrow firmware-page">
      <Notification message={notice} />
      <p className="help firmware-lead">{view?.label ?? type} · dotyczy wszystkich sterowników tego rodzaju.</p>

      <section className="card">
        <header className="card-head">
          <h2>Aktualna wersja</h2>
          <IconButton label="Dodaj wersję" icon={<PlusIcon />} active={adding} onClick={() => (adding ? closeAdd() : setAdding(true))} />
        </header>
        {active ? (
          <>
            <div className="fw-current">
              <span className="fw-ver">{active.version}</span>
              <div className="fw-meta">
                <strong>{enabled ? 'oferowana sterownikom' : 'aktualizacje wyłączone'}</strong>
                <small>dodana {formatDate(active.createdAt)} · {formatBytes(active.size)} · sha256 <span title={active.sha256}>{shortSha(active.sha256)}</span></small>
              </div>
              <Switch on={enabled} label={enabled ? 'Aktualizacje włączone' : 'Aktualizacje wyłączone'} disabled={noticeBusy}
                onChange={(on) => run(() => FirmwareRequests.update(type, { enabled: on }))} />
            </div>
            {active.description && <p className="fw-desc">{active.description}</p>}
            <p className="help">
              {enabled
                ? 'Sterownik dostaje ofertę tylko przy zleceniu „Aktualizuj” w Ustawieniach. Wyłączone „Aktualizacje” wstrzymują też zlecone.'
                : 'Aktualizacje wyłączone: „Aktualizuj” w Ustawieniach jest niedostępne, sterowniki niczego nie pobiorą.'}
            </p>
          </>
        ) : (
          <p className="help">{summary ? 'Nie wgrano jeszcze żadnego pliku.' : 'Ładowanie…'}</p>
        )}
        {error && !adding && <div className="alert alert-err" role="alert"><div><strong>{error}</strong></div></div>}
      </section>

      {adding && (
        <form ref={addCard} className="card" onSubmit={upload}>
          <header className="card-head"><h2>Dodaj wersję</h2></header>
          <label className="field">
            <span>Plik .bin</span>
            <input key={fileKey} type="file" accept=".bin" onChange={chooseFile} />
          </label>
          <label className="field">
            <span>Wersja<InfoTip>Wpisz wersję zgodną z <code>FW_VERSION</code> w kodzie firmware. Sterownik zgłasza ją po aktualizacji; dopóki zgłasza inną, przy sterowniku widać „dostępna” i przycisk „Aktualizuj”.</InfoTip></span>
            <input type="text" value={version} placeholder="np. 1.0.1" maxLength={32} autoComplete="off"
              onChange={(event) => setVersion(event.currentTarget.value)} />
          </label>
          <label className="field">
            <span>Opis wersji</span>
            <textarea value={description} rows={3} maxLength={MAX_DESCRIPTION_LENGTH} placeholder="Co się zmieniło (do 500 znaków)"
              onChange={(event) => setDescription(event.currentTarget.value)} />
          </label>
          {file && (
            <p className="help">{file.name} · {formatBytes(file.size)}{sha && <> · SHA-256 <code>{shortSha(sha)}</code></>}</p>
          )}
          <p className="help">Serwer sprawdza nagłówek ESP32 i rozmiar ≤ {formatBytes(MAX_FIRMWARE_BYTES)}, liczy SHA-256 i ustawia wersję jako oferowaną; w bazie zostają dwie wersje.</p>
          {error && <div className="alert alert-err" role="alert"><div><strong>{error}</strong></div></div>}
          <div className="actions firmware-actions">
            <button type="button" className="btn" onClick={closeAdd}>Anuluj</button>
            <button type="submit" className="btn btn-primary" disabled={busy || noticeBusy || !file || !version.trim() || file.size > MAX_FIRMWARE_BYTES}>
              {busy ? 'Wgrywam…' : 'Wgraj'}
            </button>
          </div>
        </form>
      )}

      {devices.length > 0 && (
        <section className="card">
          <header className="card-head"><h2>Sterowniki tego rodzaju</h2><span className="card-hint">wersja z ostatniego zgłoszenia</span></header>
          <ul className="people">
            {devices.map((device) => {
              const chip = deviceChip(device, summary?.version ?? null, enabled);
              return (
                <li key={device.rootId}>
                  <span className="person">
                    <strong>{device.name?.trim() || device.deviceId}</strong>
                    <small>{device.firmwareVersion ?? 'starszy firmware nie zgłasza wersji'}{device.firmwareSeenAt ? ` · zgłoszenie ${formatDateTime(device.firmwareSeenAt)}` : ''}</small>
                  </span>
                  <span className={`chip ${chip.className}`}>{chip.text}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="card">
        <header className="card-head"><h2>Poprzednie wersje</h2><span className="card-hint">w bazie zostają dwie</span></header>
        {previous.length === 0 && <p className="help">Brak poprzednich wersji.</p>}
        {previous.length > 0 && (
          <ul className="people">
            {previous.map((image) => (
              <li key={image.version}>
                <span className="fw-ver sm">{image.version}</span>
                <span className="person">
                  <strong>{image.description || 'Bez opisu'}</strong>
                  <small>dodana {formatDate(image.createdAt)} · {formatBytes(image.size)} · sha256 <span title={image.sha256}>{shortSha(image.sha256)}</span></small>
                </span>
                <button type="button" className="btn btn-ghost btn-sm" disabled={noticeBusy}
                  onClick={() => run(() => FirmwareRequests.update(type, { version: image.version }), `Oferowana wersja: ${image.version}.`)}>Przywróć</button>
                <IconButton variant="danger" label={`Usuń wersję ${image.version}`} icon={<TrashIcon />} disabled={noticeBusy} onClick={() => remove(image)} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
