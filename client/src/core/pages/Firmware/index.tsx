// Strona /firmware/:deviceType: firmware rodzaju sterownika (trybik na kafelku sterownika na liście
// /devices). Aktualna (oferowana) wersja z opisem, poprzednie wersje z opisami (przywrócenie,
// usunięcie) i dodanie nowej wersji w popupie (PUT /api/firmware/:rodzaj/:wersja). Oferta i pliki dotyczą
// wszystkich sterowników danego rodzaju, ale sterownik pobiera plik dopiero po „Aktualizuj” w swoich
// Ustawieniach (components/FirmwareStatus: wersja, stan, przycisk). Poza kontekstem urządzenia (bez rootId).
import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FirmwareRequests } from '../../api';
import { DeviceType, FirmwareImage, FirmwareSummary } from '../../types';
import { getDeviceTypeView } from '../../device-types';
import Notification, { useSaveNotice } from '../../components/Notification';
import { IconButton } from '../../components/IconButton';
import { BackIcon, PlusIcon, RestoreIcon, TrashIcon } from '../../components/icons';
import '../../components/firmwareStatus.css';
import '../../components/deviceEditModal.css';
import './style.css';

// partycja aplikacji OTA ESP32; serwer odrzuca większy plik (core/services/firmware.service.ts)
const MAX_FIRMWARE_BYTES = 1310720;
const MAX_DESCRIPTION_LENGTH = 500;

const formatBytes = (bytes: number) => `${bytes.toLocaleString('pl-PL')} B`;
const formatDateTime = (value?: string) =>
  value ? new Date(value).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' }) : '---';
const shortSha = (sha: string) => `${sha.slice(0, 8)}…${sha.slice(-6)}`;

export const Firmware: React.FC = () => {
  const { deviceType } = useParams();
  const navigate = useNavigate();
  const type = Object.values(DeviceType).find((value) => value === deviceType);
  const view = type ? getDeviceTypeView(type) : undefined;
  const supported = view?.firmwareUpdates === true;

  const [summary, setSummary] = useState<FirmwareSummary | null>(null);
  const [version, setVersion] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [sha, setSha] = useState('');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // przyciski zmian nieaktywne, dopóki widać komunikat o poprzedniej zmianie (useSaveNotice)
  const { notice, showNotice, busy: noticeBusy } = useSaveNotice(4000);
  const say = (message: string) => showNotice(message);

  // Powrót do poprzedniej strony; po wejściu wprost z adresu (bez historii aplikacji) na listę sterowników.
  // idx to licznik wpisów historii ustawiany przez React Router (BrowserRouter).
  const goBack = () => {
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate('/devices', { replace: true });
  };

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
  }, [type, supported]);

  if (!type || !supported) {
    return (
      <div className="firmware-page">
        <h2>Firmware</h2>
        <p>Ten rodzaj sterownika nie ma aktualizacji firmware przez sieć.</p>
        <p><Link to="/devices">← Lista sterowników</Link></p>
      </div>
    );
  }

  const active = summary?.images.find((image) => image.active);
  const previous = summary?.images.filter((image) => !image.active) ?? [];

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
    <div className="firmware-page">
      <Notification message={notice} />
      <div className="firmware-header">
        <IconButton label="Wróć do poprzedniej strony" icon={<BackIcon />} onClick={goBack} />
        <h2>Firmware: {view?.label ?? type}</h2>
        <span className="firmware-header-spacer" aria-hidden="true" />
      </div>
      <p className="firmware-lead">Dotyczy wszystkich sterowników tego rodzaju.</p>
      {error && !adding && <div className="firmware-error firmware-card-width" role="alert">{error}</div>}

      <section className="resource firmware-card">
        <div className="firmware-bar">
          <h3 className="firmware-title">Aktualna wersja</h3>
          <IconButton label="Dodaj nową wersję" icon={<PlusIcon />} onClick={() => setAdding(true)} />
        </div>
        {active ? (
          <>
            <div className="firmware-row"><span className="label">Wersja:</span><strong>{active.version}</strong></div>
            <div className="firmware-row"><span className="label">Dodana:</span><span>{formatDateTime(active.createdAt)}</span></div>
            <div className="firmware-row"><span className="label">Rozmiar:</span><span>{formatBytes(active.size)}</span></div>
            <div className="firmware-row"><span className="label">SHA-256:</span><code title={active.sha256}>{shortSha(active.sha256)}</code></div>
            <div className="firmware-row"><span className="label">Opis:</span><span className="firmware-text">{active.description || '—'}</span></div>
            <label className="firmware-switch">
              <input type="checkbox" checked={summary?.enabled ?? false}
                onChange={(event) => run(() => FirmwareRequests.update(type, { enabled: event.currentTarget.checked }))} />
              <span>{summary?.enabled
                ? 'Aktualizacje włączone'
                : 'Aktualizacje wyłączone: „Aktualizuj” jest niedostępne, sterowniki niczego nie pobiorą'}</span>
            </label>
          </>
        ) : (
          <div className="firmware-hint">{summary ? 'Nie wgrano jeszcze żadnego pliku.' : 'Ładowanie…'}</div>
        )}
        <h3 className="firmware-title">Poprzednie wersje</h3>
        {previous.length === 0 && <div className="firmware-hint">Brak poprzednich wersji.</div>}
        {previous.map((image) => (
          <div key={image.version} className="firmware-version">
            <div className="firmware-version-main">
              <div className="firmware-version-head">
                <strong>{image.version}</strong>
                <span className="firmware-hint">{formatDateTime(image.createdAt)} · {formatBytes(image.size)} · <code>{shortSha(image.sha256)}</code></span>
              </div>
              <div className="firmware-text">{image.description || 'Bez opisu.'}</div>
            </div>
            <div className="firmware-version-actions">
              <IconButton label={`Przywróć wersję ${image.version}`} icon={<RestoreIcon />} disabled={noticeBusy}
                onClick={() => run(() => FirmwareRequests.update(type, { version: image.version }), `Oferowana wersja: ${image.version}.`)} />
              <IconButton variant="danger" label={`Usuń wersję ${image.version}`} icon={<TrashIcon />} disabled={noticeBusy} onClick={() => remove(image)} />
            </div>
          </div>
        ))}
      </section>

      {adding && (
        <div className="device-modal-backdrop" onClick={closeAdd}>
          <form className="device-modal firmware-modal" role="dialog" aria-modal="true" aria-labelledby="firmware-modal-title"
            onClick={(event) => event.stopPropagation()} onSubmit={upload}>
            <h2 id="firmware-modal-title">Dodaj wersję</h2>
            <label>
              <span>Plik firmware</span>
              <input key={fileKey} type="file" accept=".bin" onChange={chooseFile} />
            </label>
            <label>
              <span>Wersja</span>
              <input type="text" value={version} placeholder="np. 1.0.1" maxLength={32} autoComplete="off"
                onChange={(event) => setVersion(event.currentTarget.value)} />
            </label>
            <label>
              <span>Opis</span>
              <textarea value={description} rows={3} maxLength={MAX_DESCRIPTION_LENGTH} placeholder="Co się zmieniło w tej wersji"
                onChange={(event) => setDescription(event.currentTarget.value)} />
            </label>
            {file && (
              <div className="firmware-hint">
                {file.name} · {formatBytes(file.size)}{sha && <> · SHA-256 <code>{shortSha(sha)}</code></>}
              </div>
            )}
            <div className="firmware-hint">
              Wpisz wersję zgodną z ustawieniem wersji komponentu <code>FW_VERSION</code>.
            </div>
            {error && <p className="device-modal-error" role="alert">{error}</p>}
            <div className="device-modal-actions">
              <button type="button" className="device-modal-cancel" onClick={closeAdd}>Anuluj</button>
              <button type="submit" disabled={busy || noticeBusy || !file || !version.trim() || file.size > MAX_FIRMWARE_BYTES}>
                {busy ? 'Wgrywam…' : 'Wgraj'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
