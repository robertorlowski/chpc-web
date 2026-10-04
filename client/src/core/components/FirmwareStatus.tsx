// Wiersze „Firmware” w karcie „Sterownik” na stronie Ustawienia: wersja zgłoszona przez sterownik
// przy ostatnim uruchomieniu, stan względem oferowanej wersji, czas zgłoszenia i przycisk „Aktualizuj”.
// Sterowniki nie aktualizują się same: „Aktualizuj” zapisuje zlecenie (POST /devices/:rootId/firmware-update)
// i dopiero wtedy chmura wysyła sterownikowi ofertę; zlecenie znika, gdy sterownik zgłosi nową wersję.
// Tylko rodzaje z aktualizacją przez sieć (firmwareUpdates w rejestrze; firmwareUpdateHint mówi, kiedy
// sterownik pobierze plik). Wersja i zlecenie z GET /api/devices (nie z localStorage), oferta z
// GET /api/firmware/:rodzaj; przy zleceniu stan jest odświeżany co 15 s.
import { useEffect, useState } from 'react';
import { DeviceRequests, FirmwareRequests } from '../api';
import { Device, FirmwareSummary } from '../types';
import { getDeviceTypeView } from '../device-types';
import './firmwareStatus.css';

const REFRESH_MS = 15000;

const formatDateTime = (value?: string) =>
  value ? new Date(value).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' }) : '---';

export const FirmwareStatus: React.FC<{ device: Device | null }> = ({ device }) => {
  const [current, setCurrent] = useState<Device | null>(null);
  const [summary, setSummary] = useState<FirmwareSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const view = device ? getDeviceTypeView(device.deviceType) : undefined;
  const supported = view?.firmwareUpdates === true;

  const loadDevice = () => {
    if (!device) return;
    DeviceRequests.getDevices().then((list) => setCurrent(list?.find((item) => item.rootId === device.rootId) ?? null));
  };

  useEffect(() => {
    if (!device || !supported) return;
    loadDevice();
    FirmwareRequests.get(device.deviceType).then(setSummary);
  }, [device?.rootId, supported]);

  // zlecenie w toku: odświeżanie, aż sterownik zgłosi nową wersję
  const pending = current?.firmwareUpdate;
  useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(loadDevice, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [pending?.requestedAt]);

  if (!device || !supported) return null;

  const version = current?.firmwareVersion;
  const offered = summary?.enabled ? summary.version : null;
  const differs = Boolean(offered && version !== offered);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await action();
      loadDevice();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Operacja nie powiodła się.');
    }
    setBusy(false);
  };

  const update = () => {
    if (!window.confirm(`Zaktualizować firmware sterownika do wersji ${offered}? Sterownik po pobraniu się zrestartuje.`)) return;
    run(() => DeviceRequests.requestFirmwareUpdate(device.rootId));
  };

  return (
    <>
      <div>
        <span className="label">Wersja firmware:</span>
        <span>{version ?? (current ? '— (starszy firmware nie zgłasza wersji)' : '---')}</span>
      </div>
      {current && (
        <div>
          <span className="label">Aktualizacja:</span>
          {pending
            ? <span><span className="firmware-pill warn">zlecona</span> do wersji {pending.version} ({formatDateTime(pending.requestedAt)}), czeka na sterownik</span>
            : differs
              ? <span><span className="firmware-pill warn">dostępna</span> wersja {offered}</span>
              : <span className={`firmware-pill ${version ? 'ok' : 'off'}`}>{version ? 'aktualny' : 'brak danych'}</span>}
        </div>
      )}
      {current?.firmwareSeenAt && (
        <div><span className="label">Ostatnie zgłoszenie:</span><span>{formatDateTime(current.firmwareSeenAt)}</span></div>
      )}
      {current && (differs || pending) && (
        <div className="firmware-update">
          {pending
            ? <button type="button" className="firmware-cancel" disabled={busy}
                onClick={() => run(() => DeviceRequests.cancelFirmwareUpdate(device.rootId))}>Anuluj aktualizację</button>
            : <button type="button" disabled={busy} onClick={update}>Aktualizuj</button>}
          {view?.firmwareUpdateHint && <small className="firmware-hint-text">{view.firmwareUpdateHint}</small>}
        </div>
      )}
      {error && <div className="firmware-update-error" role="alert">{error}</div>}
    </>
  );
};
