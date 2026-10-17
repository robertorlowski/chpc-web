// Wiersz „Adres IP” karty „Sterownik” na stronie Ustawienia (wszystkie rodzaje sterowników): adres w sieci
// lokalnej z ostatniego zgłoszenia sterownika (POST /api/devices/register, pole ip) i czas tego zgłoszenia.
// Pod tym adresem są strony sterownika (/, /install). Dane z GET /api/devices, a nie z localStorage, bo adres
// zmienia się po stronie sterownika (useCurrentDevice). DeviceAddressRow to sam wiersz <div><dt/><dd/></div> do
// <dl class="kv"> (ControllerCard); DeviceAddress owija go własnym <dl class="kv kv-rows"> (wstawienie za innymi
// wierszami w dowolnej karcie; firmwareStatus.css daje pierwszemu wierszowi linię jak kolejnym).
import { useEffect, useState } from 'react';
import { DeviceRequests } from '../api';
import { Device } from '../types';

const formatDateTime = (value?: string) =>
  value ? new Date(value).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' }) : '';

// Aktualny dokument sterownika z serwera (adres IP, firmware, zlecenie aktualizacji); reload() odświeża.
export function useCurrentDevice(device: Device | null): { current: Device | null; reload: () => void } {
  const [current, setCurrent] = useState<Device | null>(null);
  const reload = () => {
    if (!device) return;
    DeviceRequests.getDevices().then((list) => setCurrent(list?.find((item) => item.rootId === device.rootId) ?? null));
  };
  useEffect(() => { setCurrent(null); reload(); }, [device?.rootId]);
  return { current, reload };
}

export const DeviceAddressRow: React.FC<{ current: Device | null }> = ({ current }) => {
  const ip = current?.ipAddress;
  return (
    <div>
      <dt>Adres IP</dt>
      <dd>
        {ip
          ? <><a className="link" href={`http://${ip}/`} target="_blank" rel="noreferrer">{ip}</a>
              {current?.ipSeenAt && <small>{formatDateTime(current.ipSeenAt)}</small>}</>
          : <span>{current ? '— (sterownik nie zgłosił adresu)' : '---'}</span>}
      </dd>
    </div>
  );
};

export const DeviceAddress: React.FC<{ device: Device | null }> = ({ device }) => {
  const { current } = useCurrentDevice(device);
  if (!device) return null;
  return <dl className="kv kv-rows"><DeviceAddressRow current={current} /></dl>;
};
