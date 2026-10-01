// Strona /firmware: wersja i plik firmware, który sterownik pobiera przez sieć (OTA). Wgranie
// pliku (PUT /api/firmware/:rodzaj/:wersja), włączenie i wyłączenie oferty, przywrócenie poprzedniej
// wersji, lista sterowników z wersją zgłoszoną przy ostatnim uruchomieniu i pobranie pliku.
// Poza kontekstem urządzenia (bez rootId): otwierana z listy sterowników (/devices).
import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DeviceRequests, FirmwareRequests } from '../../api';
import { Device, DeviceType, FirmwareSummary } from '../../types';
import { deviceLabel } from '../../context/DeviceContext';
import Notification from '../../components/Notification';
import './style.css';

// Rodzaje sterowników z aktualizacją przez sieć (serwer: firmwareUpdates w device-type.ts).
const FIRMWARE_TYPE = DeviceType.WATER_PRESSURE_TANK;
const FIRMWARE_TYPE_LABEL = 'Hydrofor';
// partycja aplikacji OTA ESP32; serwer odrzuca większy plik (core/services/firmware.service.ts)
const MAX_FIRMWARE_BYTES = 1310720;

const formatBytes = (bytes: number) => `${bytes.toLocaleString('pl-PL')} B`;
const formatDateTime = (value?: string) =>
  value ? new Date(value).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' }) : '---';
const shortSha = (sha: string) => `${sha.slice(0, 8)}…${sha.slice(-6)}`;

// Stan sterownika względem oferty: bez wersji = starszy firmware (nie wysyła version).
function deviceState(device: Device, summary: FirmwareSummary) {
  if (!device.firmwareVersion) return { label: 'starszy firmware', tone: 'off' };
  if (!summary.version || device.firmwareVersion === summary.version) return { label: 'aktualny', tone: 'ok' };
  return { label: summary.enabled ? 'czeka na pompę' : 'oferta wyłączona', tone: summary.enabled ? 'warn' : 'off' };
}

export const Firmware: React.FC = () => {
  const [summary, setSummary] = useState<FirmwareSummary | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [version, setVersion] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [sha, setSha] = useState('');
  const [fileKey, setFileKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const say = (message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(''), 4000);
  };

  const load = () => {
    FirmwareRequests.get(FIRMWARE_TYPE).then((result) => {
      if (result) setSummary(result);
      else setError('Nie udało się pobrać stanu firmware.');
    });
    DeviceRequests.getDevices().then((list) => {
      if (list) setDevices(list.filter((device) => device.deviceType === FIRMWARE_TYPE));
    });
  };

  useEffect(load, []);

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
    // zawiera wersję z nazwy pliku (water-pressure-tank-1.0.1.bin), gdy pole jest puste
    const fromName = chosen.name.match(/(\d+(?:\.\d+)+)/)?.[1];
    if (fromName && !version.trim()) setVersion(fromName);
    try {
      const digest = await crypto.subtle.digest('SHA-256', await chosen.arrayBuffer());
      setSha(Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join(''));
    } catch {
      // brak crypto.subtle (np. http w sieci lokalnej): sumę policzy serwer
    }
  };

  const upload = async (event: FormEvent) => {
    event.preventDefault();
    if (!file || !version.trim()) return;
    setBusy(true);
    setError('');
    try {
      setSummary(await FirmwareRequests.upload(FIRMWARE_TYPE, version.trim(), file));
      setFile(null);
      setSha('');
      setVersion('');
      setFileKey((key) => key + 1);
      say('Plik zapisany. Sterowniki dostaną go przy następnym zgłoszeniu.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nie udało się wgrać pliku.');
    } finally {
      setBusy(false);
    }
  };

  const toggleEnabled = async (enabled: boolean) => {
    try {
      setSummary(await FirmwareRequests.update(FIRMWARE_TYPE, { enabled }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nie udało się zmienić ustawienia.');
    }
  };

  const restore = async (target: string) => {
    try {
      setSummary(await FirmwareRequests.update(FIRMWARE_TYPE, { version: target }));
      say(`Oferowana wersja: ${target}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nie udało się przywrócić wersji.');
    }
  };

  const counts = summary
    ? devices.reduce<Record<string, number>>((acc, device) => {
      const { tone } = deviceState(device, summary);
      acc[tone] = (acc[tone] ?? 0) + 1;
      return acc;
    }, {})
    : {};

  return (
    <div className="firmware-page">
      <Notification message={notice} />
      <h2>Firmware: {FIRMWARE_TYPE_LABEL}</h2>
      <p className="firmware-lead">
        Plik, który sterownik pobierze przez sieć przy najbliższym uruchomieniu pompy. Plik jest przechowywany w bazie serwera,
        a zmiana działa od razu.
      </p>
      <p><Link to="/devices">← Lista sterowników</Link></p>

      <form className="resource firmware-card" onSubmit={upload}>
        <h3 className="firmware-title">Wersja do pobrania</h3>
        <label className="firmware-switch">
          <input type="checkbox" checked={summary?.enabled ?? false} disabled={!summary?.version}
            onChange={(event) => toggleEnabled(event.currentTarget.checked)} />
          <span>{summary?.enabled ? 'Aktualizacje włączone' : 'Aktualizacje wyłączone: sterowniki niczego nie pobiorą'}</span>
        </label>
        <div className="firmware-row">
          <span className="label">Oferowana wersja:</span>
          <strong>{summary?.version ?? 'brak pliku'}</strong>
        </div>

        <h3 className="firmware-title">Nowa wersja</h3>
        <label className="firmware-row">
          <span className="label">Plik firmware:</span>
          <input key={fileKey} type="file" accept=".bin" onChange={chooseFile} />
        </label>
        <label className="firmware-row">
          <span className="label">Wersja:</span>
          <input type="text" value={version} placeholder="np. 1.0.1" maxLength={32} autoComplete="off"
            onChange={(event) => setVersion(event.currentTarget.value)} />
        </label>
        {file && (
          <div className="firmware-hint">
            {file.name} · {formatBytes(file.size)}{sha && <> · SHA-256 <code>{shortSha(sha)}</code></>}
          </div>
        )}
        <div className="firmware-hint">
          Wpisz tę samą wersję, co <code>FW_VERSION</code> w pliku: po aktualizacji sterownik zgłosi właśnie ją.
          Serwer trzyma bieżącą i jedną poprzednią wersję, starsze pliki są usuwane.
        </div>
        {error && <div className="firmware-error" role="alert">{error}</div>}
        <div className="firmware-actions">
          <button type="submit" disabled={busy || !file || !version.trim() || file.size > MAX_FIRMWARE_BYTES}>
            {busy ? 'Wgrywam…' : 'Wgraj i ustaw jako oferowaną'}
          </button>
        </div>
      </form>

      <section className="resource firmware-card">
        <h3 className="firmware-title">Sterowniki</h3>
        {summary && devices.length > 0 && (
          <div className="firmware-summary">
            {counts.ok && <span className="firmware-pill ok">{counts.ok} aktualny</span>}
            {counts.warn && <span className="firmware-pill warn">{counts.warn} czeka na aktualizację</span>}
            {counts.off && <span className="firmware-pill off">{counts.off} bez aktualizacji</span>}
          </div>
        )}
        <div className="firmware-scroll">
          <table className="firmware-table">
            <thead>
              <tr><th>Nazwa</th><th>Wersja</th><th>Stan</th><th>Ostatnie zgłoszenie</th></tr>
            </thead>
            <tbody>
              {summary && devices.map((device) => {
                const state = deviceState(device, summary);
                return (
                  <tr key={device.rootId}>
                    <td title={device.deviceId}>{deviceLabel(device)}</td>
                    <td>{device.firmwareVersion ?? '—'}</td>
                    <td><span className={`firmware-pill ${state.tone}`}>{state.label}</span></td>
                    <td>{formatDateTime(device.firmwareSeenAt)}</td>
                  </tr>
                );
              })}
              {devices.length === 0 && <tr><td colSpan={4}>Brak sterowników tego rodzaju.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="firmware-hint">
          „Czeka na pompę”: sterownik jest zasilany tylko w czasie pracy pompy, więc pobierze plik przy jej następnym,
          dłuższym uruchomieniu.
        </div>
      </section>

      <section className="resource firmware-card">
        <h3 className="firmware-title">Wersje w bazie</h3>
        <div className="firmware-scroll">
          <table className="firmware-table">
            <thead>
              <tr><th>Wersja</th><th>Dodana</th><th>Rozmiar</th><th>SHA-256</th><th></th></tr>
            </thead>
            <tbody>
              {summary?.images.map((image) => (
                <tr key={image.version}>
                  <td>{image.version} {image.active && <span className="firmware-pill ok">oferowana</span>}</td>
                  <td>{formatDateTime(image.createdAt)}</td>
                  <td>{formatBytes(image.size)}</td>
                  <td><code>{shortSha(image.sha256)}</code></td>
                  <td className="firmware-row-actions">
                    <a href={FirmwareRequests.fileUrl(FIRMWARE_TYPE, image.version)} download>Pobierz</a>
                    {!image.active && <button type="button" onClick={() => restore(image.version)}>Przywróć</button>}
                  </td>
                </tr>
              ))}
              {summary && summary.images.length === 0 && <tr><td colSpan={5}>Nie wgrano jeszcze żadnego pliku.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
