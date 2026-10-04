// Zakładka Ustawienia kotła pelletowego (/settings): tryb pracy i główne parametry regulatora ze zmianą
// z aplikacji (components/MainParameters.tsx), interwał odpytywania pieca (PUT /device/properties),
// dane sterownika i zwinięty panel „Ustawienia zaawansowane” (wszystkie parametry, podgląd).
import { FormEvent, useEffect, useState } from 'react';
import { DeviceRequests } from '../../../core/api';
import { DeviceProperties } from '../../../core/types';
import Notification from '../../../core/components/Notification';
import { DeviceEditModal } from '../../../core/components/DeviceEditModal';
import { DeviceAddress } from '../../../core/components/DeviceAddress';
import { ControllerCardTitle } from '../../../core/components/ControllerCardTitle';
import { FirmwareStatus } from '../../../core/components/FirmwareStatus';
import { useDevice } from '../../../core/context/DeviceContext';
import { DEFAULT_POLL_SECONDS } from '../utils/boiler';
import { AdvancedSettings } from '../components/AdvancedSettings';
import { MainParameters } from '../components/MainParameters';
import './style.css';

// interwał w minutach w formularzu, w sekundach w ustawieniach (30–3600 s = 0,5–60 min)
const MIN_MINUTES = 0.5;
const MAX_MINUTES = 60;
const minutesText = (seconds: number) => String(seconds / 60).replace('.', ',');

export const PelletBoilerSettings: React.FC = () => {
  const { device, selectDevice } = useDevice();
  const [properties, setProperties] = useState<DeviceProperties | null>(null);
  const [minutes, setMinutes] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editingDevice, setEditingDevice] = useState(false);

  useEffect(() => {
    DeviceRequests.getDeviceProperties().then((result) => {
      const loaded = result ?? {};
      setProperties(loaded);
      setMinutes(minutesText(loaded.poll_interval_seconds ?? DEFAULT_POLL_SECONDS));
    });
  }, []);

  // Serwer zastępuje całe properties, dlatego zapis rozszerza wczytany obiekt.
  const save = async (event: FormEvent) => {
    event.preventDefault();
    const value = Number(minutes.replace(',', '.'));
    if (!Number.isFinite(value) || value < MIN_MINUTES || value > MAX_MINUTES) {
      return setError('Odpytywanie pieca: od 0,5 do 60 minut.');
    }
    setError('');
    try {
      const saved = await DeviceRequests.updateDeviceProperties({
        ...properties,
        poll_interval_seconds: Math.round(value * 60),
      });
      setProperties(saved);
      setNotice('Zapisano. Sterownik pobierze nową wartość przy następnym wysłaniu danych.');
      window.setTimeout(() => setNotice(''), 4000);
    } catch {
      setError('Nie udało się zapisać ustawień.');
    }
  };

  return (
    <div className="settings boiler-page">
      <Notification message={notice} />
      <h2>Ustawienia</h2>
      <section>
        <MainParameters />

        <form className="resource boiler-form" onSubmit={save}>
          <h3 className="settings-section-title">Odpytywanie</h3>
          <label>
            <span className="label">Odpytywanie pieca [min]:</span>
            <input type="number" min={MIN_MINUTES} max={MAX_MINUTES} step={0.5} value={minutes}
              onChange={(event) => setMinutes(event.currentTarget.value)} />
          </label>
          <div className="boiler-hint">Co ile sterownik odczytuje piec i wysyła dane (0,5–60 min).</div>
          {error && <div className="boiler-error">{error}</div>}
          <div className="boiler-actions">
            <button type="submit" disabled={properties === null}>Zapisz</button>
          </div>
        </form>

        <AdvancedSettings />

        <div className="resource settings-device">
          <ControllerCardTitle disabled={!device} onEdit={() => setEditingDevice(true)} />
          <div><span className="label">Nazwa:</span><span>{device?.name?.trim() || '---'}</span></div>
          <div><span className="label">Identyfikator:</span><code>{device?.deviceId ?? '---'}</code></div>
          <div><span className="label">Root ID:</span><code>{device?.rootId ?? '---'}</code></div>
          <DeviceAddress device={device} />
          <FirmwareStatus device={device} actionsClassName="boiler-actions" />
        </div>
      </section>

      {editingDevice && device && (
        <DeviceEditModal
          device={device}
          onClose={() => setEditingDevice(false)}
          onSaved={(updated) => { selectDevice(updated); setEditingDevice(false); }}
        />
      )}
    </div>
  );
};
