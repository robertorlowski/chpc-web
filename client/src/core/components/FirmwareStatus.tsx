// Wiersze „Firmware” i „Ostatnie zgłoszenie” karty „Sterownik” na stronie Ustawienia oraz przycisk
// „Aktualizuj firmware” / „Anuluj aktualizację” w .actions (makieta #s-hp-ustawienia): wersja zgłoszona przez
// sterownik przy ostatnim uruchomieniu, chip stanu względem oferowanej wersji (aktualny / dostępna X / zlecona),
// czas zgłoszenia. Sterowniki nie aktualizują się same: „Aktualizuj” zapisuje zlecenie
// (POST /devices/:rootId/firmware-update) i dopiero wtedy chmura wysyła sterownikowi ofertę; zlecenie znika, gdy
// sterownik zgłosi nową wersję. Tylko rodzaje z aktualizacją przez sieć (firmwareUpdates w rejestrze).
// Wersja i zlecenie z GET /api/devices (nie z localStorage), oferta z GET /api/firmware/:rodzaj; przy zleceniu stan
// jest odświeżany co 15 s. useFirmwareStatus + FirmwareRows + FirmwareActions składa ControllerCard w jedną kartę;
// FirmwareStatus to wariant samodzielny (własny <dl class="kv"> i .actions) do wstawienia w dowolną kartę.
import { useEffect, useState } from 'react';
import { DeviceRequests, FirmwareRequests } from '../api';
import { Device, FirmwareSummary } from '../types';
import { getDeviceTypeView } from '../device-types';
import { useCurrentDevice } from './DeviceAddress';
import './firmwareStatus.css';

const REFRESH_MS = 15000;

const formatDateTime = (value?: string) =>
  value ? new Date(value).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' }) : '---';

export type FirmwareState = {
  supported: boolean;
  current: Device | null;
  version?: string;
  offered: string | null;
  differs: boolean;
  pending?: { version: string; requestedAt: string };
  busy: boolean;
  error: string;
  /** zlecenie aktualizacji (z potwierdzeniem) i jego odwołanie */
  update: () => void;
  cancel: () => void;
  /** aktualizację zleca tylko właściciel (osoba z udostępnieniem widzi sam stan) */
  canRequest: boolean;
};

export function useFirmwareStatus(device: Device | null): FirmwareState {
  const { current, reload } = useCurrentDevice(device);
  const [summary, setSummary] = useState<FirmwareSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const view = device ? getDeviceTypeView(device.deviceType) : undefined;
  const supported = view?.firmwareUpdates === true;

  useEffect(() => {
    if (!device || !supported) return;
    FirmwareRequests.get(device.deviceType).then(setSummary);
  }, [device?.rootId, supported]);

  // zlecenie w toku: odświeżanie, aż sterownik zgłosi nową wersję
  const pending = current?.firmwareUpdate;
  useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(reload, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [pending?.requestedAt]);

  const version = current?.firmwareVersion;
  const offered = summary?.enabled ? summary.version : null;
  const differs = Boolean(offered && version !== offered);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await action();
      reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Operacja nie powiodła się.');
    }
    setBusy(false);
  };

  const update = () => {
    if (!device) return;
    if (!window.confirm(`Zaktualizować firmware sterownika do wersji ${offered}? Sterownik po pobraniu się zrestartuje.`)) return;
    run(() => DeviceRequests.requestFirmwareUpdate(device.rootId));
  };
  const cancel = () => {
    if (device) run(() => DeviceRequests.cancelFirmwareUpdate(device.rootId));
  };

  return {
    supported, current, version, offered, differs, pending, busy, error, update, cancel,
    canRequest: !!current && current.access !== 'shared',
  };
}

// Wiersze <div><dt/><dd/></div> do <dl class="kv">: Firmware z chipem stanu i Ostatnie zgłoszenie.
export const FirmwareRows: React.FC<{ state: FirmwareState }> = ({ state }) => {
  const { current, version, offered, differs, pending } = state;
  if (!state.supported) return null;
  return (
    <>
      <div>
        <dt>Firmware</dt>
        <dd>
          {version ?? (current ? '—' : '---')}{' '}
          {current && (pending
            ? <span className="chip chip-warn">zlecona {pending.version}</span>
            : differs
              ? <span className="chip chip-warn">dostępna {offered}</span>
              : <span className={`chip ${version ? 'chip-ok' : 'chip-off'}`}>{version ? 'aktualny' : 'brak danych'}</span>)}
          {current && !version && <small className="block">starszy firmware nie zgłasza wersji</small>}
          {pending && <small className="block">zlecona {formatDateTime(pending.requestedAt)}, czeka na sterownik</small>}
        </dd>
      </div>
      {current?.firmwareSeenAt && (
        <div><dt>Ostatnie zgłoszenie</dt><dd>{formatDateTime(current.firmwareSeenAt)}</dd></div>
      )}
    </>
  );
};

// Błąd zlecenia i wiersz .actions z przyciskiem „Aktualizuj firmware” (nieaktywny, gdy sterownik ma oferowaną
// wersję) albo „Anuluj aktualizację”. Bez przycisku, gdy rodzaj nie ma OTA albo oglądający nie jest właścicielem.
export const FirmwareActions: React.FC<{ state: FirmwareState; className?: string }> = ({ state, className }) => {
  const { supported, current, pending, differs, busy, error, canRequest } = state;
  if (!supported || !current || !canRequest) return null;
  return (
    <>
      {error && <div className="alert alert-err" role="alert"><div><strong>{error}</strong></div></div>}
      <div className={className ?? 'actions'}>
        {pending
          ? <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={state.cancel}>Anuluj aktualizację</button>
          : <button type="button" className="btn btn-ghost btn-sm" disabled={busy || !differs} onClick={state.update}
              title={differs ? `Zleć aktualizację do wersji ${state.offered}` : 'Sterownik ma oferowaną wersję'}>Aktualizuj firmware</button>}
      </div>
    </>
  );
};

// Wariant samodzielny: własny <dl class="kv"> z wierszami i .actions pod nim (actionsClassName: klasa wiersza przycisków).
export const FirmwareStatus: React.FC<{ device: Device | null; actionsClassName?: string }> = ({ device, actionsClassName }) => {
  const state = useFirmwareStatus(device);
  if (!device || !state.supported) return null;
  return (
    <>
      <dl className="kv kv-rows"><FirmwareRows state={state} /></dl>
      <FirmwareActions state={state} className={actionsClassName} />
    </>
  );
};
