// Zakładka Ustawienia hydroforu (/settings): czas kompresora (PUT /device/properties),
// przepływ pompy wyliczony z odczytów wodomierza (GET /water-pressure-tank/flow) i dane sterownika.
import { FormEvent, useEffect, useState } from 'react';
import { DeviceRequests } from '../../../core/api';
import { DeviceProperties } from '../../../core/types';
import Notification from '../../../core/components/Notification';
import { DeviceEditModal } from '../../../core/components/DeviceEditModal';
import { FirmwareStatus } from '../../../core/components/FirmwareStatus';
import { DeviceAddress } from '../../../core/components/DeviceAddress';
import { useDevice } from '../../../core/context/DeviceContext';
import { WaterPressureTankRequests } from '../api';
import { WaterFlow } from '../types';
import { FlowDetails } from '../components/FlowDetails';
import './style.css';

// Ustawienia hydroforu: czas kompresora. Sterownik pobiera go przy swoim następnym
// starcie (zgłoszenie w chmurze). Wody nie ustawia się: serwer liczy ją z czasu pracy
// pompy i przepływu z wodomierza (zakładka Dane → Odczyty wodomierza).
export const WaterPressureTankSettings: React.FC = () => {
  const { device, selectDevice } = useDevice();
  const [properties, setProperties] = useState<DeviceProperties | null>(null);
  const [compressor, setCompressor] = useState('');
  const [flow, setFlow] = useState<WaterFlow | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editingDevice, setEditingDevice] = useState(false);

  useEffect(() => {
    DeviceRequests.getDeviceProperties().then((result) => {
      const loaded = result ?? {};
      setProperties(loaded);
      setCompressor(String(loaded.compressor_seconds ?? 30));
    });
    WaterPressureTankRequests.getFlow().then((result) => result && setFlow(result));
  }, []);

  // Serwer zastępuje całe properties ($set), dlatego zapis rozszerza wczytany obiekt.
  const save = async (event: FormEvent) => {
    event.preventDefault();
    const seconds = Number(compressor);
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600) {
      return setError('Czas pracy kompresora: pełne sekundy od 1 do 3600.');
    }
    setError('');
    try {
      const saved = await DeviceRequests.updateDeviceProperties({ ...properties, compressor_seconds: seconds });
      setProperties(saved);
      setNotice('Zapisano. Sterownik pobierze ustawienia przy następnym uruchomieniu pompy.');
      window.setTimeout(() => setNotice(''), 4000);
    } catch {
      setError('Nie udało się zapisać ustawień.');
    }
  };

  return (
    <div className="settings water-page">
      <Notification message={notice} />
      <h2>Ustawienia</h2>
      <section>
        <form className="resource water-form water-settings-form" onSubmit={save}>
          <h3 className="settings-section-title">Kompresor</h3>
          <label>
            <span className="label">Czas pracy kompresora [s]:</span>
            <input type="number" min={1} max={3600} value={compressor}
              onChange={(event) => setCompressor(event.currentTarget.value)} />
          </label>
          {error && <div className="water-error">{error}</div>}
          <div className="water-actions">
            <button type="submit" disabled={properties === null}>Zapisz</button>
          </div>
        </form>

        <div className="resource">
          <h3 className="settings-section-title">Przepływ pompy</h3>
          <FlowDetails flow={flow} />
        </div>

        <div className="resource settings-device">
          <h3 className="settings-section-title">Sterownik</h3>
          <div><span className="label">Nazwa:</span><span>{device?.name?.trim() || '---'}</span></div>
          <div><span className="label">Identyfikator:</span><code>{device?.deviceId ?? '---'}</code></div>
          <div><span className="label">Root ID:</span><code>{device?.rootId ?? '---'}</code></div>
          <DeviceAddress device={device} />
          <FirmwareStatus device={device} />
          <div className="water-actions">
            <button type="button" disabled={!device} onClick={() => setEditingDevice(true)}>Zmień</button>
          </div>
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
