// Wiersz „Adres IP” w karcie „Sterownik” na stronie Ustawienia (wszystkie rodzaje sterowników):
// adres w sieci lokalnej z ostatniego zgłoszenia sterownika (POST /api/devices/register, pole ip)
// i czas tego zgłoszenia. Pod tym adresem są strony sterownika (/, /install).
// Dane z GET /api/devices, a nie z localStorage, bo adres zmienia się po stronie sterownika.
import { useEffect, useState } from 'react';
import { DeviceRequests } from '../api';
import { Device } from '../types';

const formatDateTime = (value?: string) =>
  value ? new Date(value).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' }) : '';

export const DeviceAddress: React.FC<{ device: Device | null }> = ({ device }) => {
  const [current, setCurrent] = useState<Device | null>(null);

  useEffect(() => {
    if (!device) return;
    DeviceRequests.getDevices().then((list) => setCurrent(list?.find((item) => item.rootId === device.rootId) ?? null));
  }, [device?.rootId]);

  if (!device) return null;

  const ip = current?.ipAddress;
  return (
    <div>
      <span className="label">Adres IP:</span>
      {ip
        ? <span><a href={`http://${ip}/`} target="_blank" rel="noreferrer"><code>{ip}</code></a>
            {current?.ipSeenAt && <small> ({formatDateTime(current.ipSeenAt)})</small>}</span>
        : <span>{current ? '— (sterownik nie zgłosił adresu)' : '---'}</span>}
    </div>
  );
};
