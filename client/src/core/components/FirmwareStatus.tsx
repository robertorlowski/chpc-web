// Wiersze „Firmware” w karcie „Sterownik” na stronie Ustawienia: wersja zgłoszona przez sterownik
// przy ostatnim uruchomieniu, stan względem oferowanej wersji (aktualny / czeka na aktualizację)
// i czas zgłoszenia. Tylko rodzaje z aktualizacją przez sieć (firmwareUpdates w rejestrze).
// Wersja pochodzi z GET /api/devices (nie z localStorage), oferta z GET /api/firmware/:rodzaj.
import { useEffect, useState } from 'react';
import { DeviceRequests, FirmwareRequests } from '../api';
import { Device, FirmwareSummary } from '../types';
import { getDeviceTypeView } from '../device-types';
import './firmwareStatus.css';

const formatDateTime = (value?: string) =>
  value ? new Date(value).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' }) : '---';

export const FirmwareStatus: React.FC<{ device: Device | null }> = ({ device }) => {
  const [current, setCurrent] = useState<Device | null>(null);
  const [summary, setSummary] = useState<FirmwareSummary | null>(null);
  const supported = device ? getDeviceTypeView(device.deviceType).firmwareUpdates === true : false;

  useEffect(() => {
    if (!device || !supported) return;
    DeviceRequests.getDevices().then((list) => setCurrent(list?.find((item) => item.rootId === device.rootId) ?? null));
    FirmwareRequests.get(device.deviceType).then(setSummary);
  }, [device?.rootId, supported]);

  if (!device || !supported) return null;

  const version = current?.firmwareVersion;
  const offered = summary?.enabled ? summary.version : null;
  const waiting = Boolean(version && offered && version !== offered);

  return (
    <>
      <div>
        <span className="label">Wersja firmware:</span>
        <span>{version ?? (current ? '— (starszy firmware nie zgłasza wersji)' : '---')}</span>
      </div>
      {current && (
        <div>
          <span className="label">Aktualizacja:</span>
          {waiting
            ? <span><span className="firmware-pill warn">czeka na aktualizację</span> do wersji {offered}</span>
            : <span className={`firmware-pill ${version ? 'ok' : 'off'}`}>{version ? 'aktualny' : 'brak danych'}</span>}
        </div>
      )}
      {current?.firmwareSeenAt && (
        <div><span className="label">Ostatnie zgłoszenie:</span><span>{formatDateTime(current.firmwareSeenAt)}</span></div>
      )}
    </>
  );
};
