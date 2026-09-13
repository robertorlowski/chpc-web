import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HpRequests } from '../../api/api';
import { Device } from '../../api/type';
import { useDevice } from '../../context/DeviceContext';
import './style.css';

export const Devices: React.FC = () => {
  const navigate = useNavigate();
  const { clearDevice, selectDevice } = useDevice();
  const [devices, setDevices] = useState<Device[]>([]);
  const [error, setError] = useState('');

  const loadDevices = () => {
    HpRequests.getDevices().then(setDevices).catch(() => setError('Nie udało się pobrać urządzeń.'));
  };

  useEffect(() => {
    clearDevice();
    loadDevices();
  }, []);

  const chooseDevice = (device: Device) => {
    selectDevice(device);
    navigate('/hp');
  };

  return (
    <main className="device-selection">
      <h1>Wybierz urządzenie</h1>
      {error && <p className="device-selection-error">{error}</p>}
      <section className="device-list">
        {devices.map((device) => (
          <button key={device.rootId} type="button" onClick={() => chooseDevice(device)}>
            <svg className="device-selection-icon" viewBox="0 0 25 25" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M11.0007 3C11.0007 3 9.86264 7.5 11.9313 12C14 16.5 13.5 21 13.5 21M18.9313 21C18.9313 21 19.6008 16.5 17.5007 13C15.4007 9.5 16.0007 6 16.0007 6M7.92989 21C7.92989 21 8.5993 16.5 6.49927 13C4.39924 9.5 4.99927 6 4.99927 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <strong>{device.name}</strong>
          </button>
        ))}
        {devices.length === 0 && <p>Brak dostępnych urządzeń.</p>}
      </section>
    </main>
  );
};
