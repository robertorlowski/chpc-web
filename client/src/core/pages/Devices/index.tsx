// Strona /devices: kafelki sterowników (GET /api/devices), wybór sterownika, gwiazdka sterownika
// domyślnego (PUT /api/devices/:rootId/default) i ołówek otwierający popup „Dane sterownika”.
// Trafia się tu z DeviceGuard (brak wyboru) albo z ikonki w stopce.
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DeviceRequests } from '../../api';
import { Device } from '../../types';
import { getDeviceTypeView } from '../../device-types';
import { DeviceEditModal } from '../../components/DeviceEditModal';
import { SettingsIcon } from '../../components/icons';
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
    DeviceRequests.getDevices()
      .then((list) => list ? setDevices(list) : setError('Nie udało się pobrać urządzeń.'))
      .catch(() => setError('Nie udało się pobrać urządzeń.'));
  };

  // wejście na listę kasuje bieżący wybór (także w localStorage): menu i stopka znikają, a powrót
  // do widoków jest możliwy tylko przez wybór kafelka
  useEffect(() => {
    clearDevice();
    loadDevices();
  }, []);

  const chooseDevice = (device: Device) => {
    selectDevice(device);
    navigate('/');
  };

  // przy wejściu do aplikacji: sterownik domyślny z bazy, a bez niego jedyny sterownik
  useEffect(() => {
    if (!automaticSelection) return;
    const preferred = devices.find((device) => device.isDefault) ?? (devices.length === 1 ? devices[0] : undefined);
    if (preferred) chooseDevice(preferred);
  }, [devices]);

  // serwer zdejmuje flagę z pozostałych sterowników, więc lokalnie też zostaje najwyżej jeden domyślny
  const toggleDefault = async (device: Device) => {
    try {
      const updated = await DeviceRequests.setDefaultDevice(device.rootId, !device.isDefault);
      setDevices((list) => list.map((item) => ({
        ...item,
        isDefault: item.rootId === updated.rootId ? updated.isDefault : false,
      })));
    } catch {
      setError('Nie udało się zmienić sterownika domyślnego.');
    }
  };

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
              {getDeviceTypeView(device.deviceType).tileIcon}
              <strong>{deviceLabel(device)}</strong>
              {/* Device ID pod nazwą; bez nazwy jest już w tytule kafelka */}
              {device.name?.trim() && <small>{device.deviceId}</small>}
            </button>
            <button
              type="button"
              className={`device-default${device.isDefault ? ' active' : ''}`}
              title={device.isDefault ? 'Sterownik domyślny (kliknij, aby wyłączyć)' : 'Ustaw jako domyślny: otwierany po starcie aplikacji'}
              aria-label={device.isDefault ? 'Wyłącz sterownik domyślny' : 'Ustaw jako sterownik domyślny'}
              aria-pressed={device.isDefault === true}
              onClick={() => toggleDefault(device)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3.5L14.6 8.8L20.4 9.6L16.2 13.7L17.2 19.5L12 16.8L6.8 19.5L7.8 13.7L3.6 9.6L9.4 8.8L12 3.5Z" strokeWidth="1.8" strokeLinejoin="round" />
              </svg>
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
            {getDeviceTypeView(device.deviceType).firmwareUpdates && (
              <button
                type="button"
                className="device-firmware"
                title="Firmware tego rodzaju sterownika"
                aria-label={`Firmware rodzaju sterownika ${deviceLabel(device)}`}
                onClick={() => navigate(`/firmware/${encodeURIComponent(device.deviceType)}`)}
              >
                <SettingsIcon />
              </button>
            )}
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
