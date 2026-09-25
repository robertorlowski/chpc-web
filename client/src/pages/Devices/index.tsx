import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { HpRequests } from '../../api/api';
import { Device } from '../../api/type';
import { DeviceEditModal } from '../../components/DeviceEditModal';
import { deviceLabel, useDevice } from '../../context/DeviceContext';
import './style.css';

// Sterowniki rejestrują się same (POST /api/devices/register), więc tu można je tylko wybrać i nazwać.
export const Devices: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { clearDevice, selectDevice } = useDevice();
  const [devices, setDevices] = useState<Device[]>([]);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Device | null>(null);

  // automatyczny wybór jedynego urządzenia tylko przy wejściu do aplikacji (przekierowanie ze strażnika),
  // nie przy świadomym przejściu na tę stronę, np. żeby zmienić nazwę sterownika
  const automaticSelection = (location.state as { auto?: boolean } | null)?.auto === true;

  const loadDevices = () => {
    HpRequests.getDevices()
      .then((list) => list ? setDevices(list) : setError('Nie udało się pobrać urządzeń.'))
      .catch(() => setError('Nie udało się pobrać urządzeń.'));
  };

  useEffect(() => {
    clearDevice();
    loadDevices();
  }, []);

  const chooseDevice = (device: Device) => {
    selectDevice(device);
    navigate('/hp');
  };

  useEffect(() => {
    if (automaticSelection && devices.length === 1) {
      chooseDevice(devices[0]);
    }
  }, [devices]);

  const saved = (updated: Device) => {
    setDevices((list) => list.map((device) => device.rootId === updated.rootId ? updated : device));
    setEditing(null);
  };

  return (
    <main className="device-selection">
      <h1>Wybierz urządzenie</h1>
      {error && <p className="device-selection-error">{error}</p>}
      <section className="device-list">
        {devices.map((device) => (
          <div key={device.rootId} className="device-card">
            <button type="button" className="device-choose" onClick={() => chooseDevice(device)}>
              <svg className="device-selection-icon" viewBox="0 0 25 25" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M11.0007 3C11.0007 3 9.86264 7.5 11.9313 12C14 16.5 13.5 21 13.5 21M18.9313 21C18.9313 21 19.6008 16.5 17.5007 13C15.4007 9.5 16.0007 6 16.0007 6M7.92989 21C7.92989 21 8.5993 16.5 6.49927 13C4.39924 9.5 4.99927 6 4.99927 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <strong>{deviceLabel(device)}</strong>
              {/* Device ID pod nazwą; bez nazwy jest już w tytule kafelka */}
              {device.name?.trim() && <small>{device.deviceId}</small>}
            </button>
            <button
              type="button"
              className="device-edit"
              title="Edytuj dane sterownika"
              aria-label={`Edytuj dane sterownika ${deviceLabel(device)}`}
              onClick={() => setEditing(device)}
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M4 20H8L18.5 9.5C19.3 8.7 19.3 7.3 18.5 6.5L17.5 5.5C16.7 4.7 15.3 4.7 14.5 5.5L4 16V20Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                <path d="M13 7L17 11" stroke="currentColor" strokeWidth="2" />
              </svg>
            </button>
          </div>
        ))}
        {devices.length === 0 && !error && (
          <p>Brak sterowników. Sterownik pojawi się tutaj sam po pierwszym połączeniu z internetem.</p>
        )}
      </section>

      {editing && <DeviceEditModal device={editing} onClose={() => setEditing(null)} onSaved={saved} />}
    </main>
  );
};
