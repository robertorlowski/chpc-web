// Zakładka Ustawienia włącznika (/settings): nazwy przekaźników (PUT /switch/relays/:relay),
// domyślny czas „Włącz na…” (PUT /device/properties) i dane sterownika z wersją firmware.
import { FormEvent, useEffect, useState } from 'react';
import { DeviceRequests } from '../../../core/api';
import { DeviceProperties } from '../../../core/types';
import Notification from '../../../core/components/Notification';
import { DeviceEditModal } from '../../../core/components/DeviceEditModal';
import { FirmwareStatus } from '../../../core/components/FirmwareStatus';
import { DeviceAddress } from '../../../core/components/DeviceAddress';
import { useDevice } from '../../../core/context/DeviceContext';
import { SwitchRequests } from '../api';
import { SwitchRelay } from '../types';
import './style.css';

export const SwitchSettings: React.FC = () => {
  const { device, selectDevice } = useDevice();
  const [relays, setRelays] = useState<SwitchRelay[] | null>(null);
  const [names, setNames] = useState<Record<number, string>>({});
  const [properties, setProperties] = useState<DeviceProperties | null>(null);
  const [defaultMinutes, setDefaultMinutes] = useState('30');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editingDevice, setEditingDevice] = useState(false);

  useEffect(() => {
    SwitchRequests.getRelays().then((result) => {
      setRelays(result ?? []);
      setNames(Object.fromEntries((result ?? []).map((relay) => [relay.relay, relay.name])));
    });
    DeviceRequests.getDeviceProperties().then((result) => {
      setProperties(result ?? {});
      setDefaultMinutes(String(result?.default_on_minutes ?? 30));
    });
  }, []);

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 3000);
  };

  // Nazwy zmienione względem wczytanych; domyślny czas — całe properties ($set na serwerze).
  const save = async (event: FormEvent) => {
    event.preventDefault();
    const minutes = Number(defaultMinutes);
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 10080) {
      return setError('Domyślny czas: pełne minuty od 0 (bez limitu) do 10080 (7 dni).');
    }
    if (Object.values(names).some((name) => name.trim().length > 40)) {
      return setError('Nazwa przekaźnika: najwyżej 40 znaków.');
    }
    setError('');
    try {
      const changed = (relays ?? []).filter((relay) => (names[relay.relay] ?? '').trim() !== relay.name);
      await Promise.all(changed.map((relay) => SwitchRequests.renameRelay(relay.relay, (names[relay.relay] ?? '').trim())));
      if (minutes !== properties?.default_on_minutes) {
        setProperties(await DeviceRequests.updateDeviceProperties({ ...properties, default_on_minutes: minutes }));
      }
      setRelays((current) => current?.map((relay) => ({ ...relay, name: (names[relay.relay] ?? '').trim() })) ?? null);
      showNotice('Zapisano.');
    } catch {
      setError('Nie udało się zapisać ustawień.');
    }
  };

  return (
    <div className="settings switch-page">
      <Notification message={notice} />
      <h2>Ustawienia</h2>
      <section>
        <form className="resource switch-form" onSubmit={save}>
          <h3 className="settings-section-title">Przekaźniki</h3>
          {relays === null && <div>Wczytywanie…</div>}
          {relays?.map((relay) => (
            <label key={relay.relay}>
              <span className="label">Przekaźnik {relay.relay}:</span>
              <input type="text" maxLength={40} placeholder={`Przekaźnik ${relay.relay}`} value={names[relay.relay] ?? ''}
                onChange={(event) => {
                  // wartość odczytana od razu: w funkcji aktualizującej stan currentTarget jest już null
                  const value = event.currentTarget.value;
                  setNames((current) => ({ ...current, [relay.relay]: value }));
                }} />
            </label>
          ))}
          <label>
            <span className="label">Czas włączenia:</span>
            <input type="number" min={0} max={10080} value={defaultMinutes}
              onChange={(event) => setDefaultMinutes(event.currentTarget.value)} />
            <span className="switch-unit">min</span>
          </label>
          <div className="switch-hint switch-form-hint">Domyślny dla „Włącz”; 0 = bez limitu czasu.</div>
          {error && <div className="switch-error">{error}</div>}
          <div className="switch-form-actions">
            <button type="submit" disabled={relays === null || properties === null}>Zapisz</button>
          </div>
        </form>

        <div className="resource settings-device">
          <h3 className="settings-section-title">Sterownik</h3>
          <div><span className="label">Nazwa:</span><span>{device?.name?.trim() || '---'}</span></div>
          <div><span className="label">Identyfikator:</span><code>{device?.deviceId ?? '---'}</code></div>
          <div><span className="label">Root ID:</span><code>{device?.rootId ?? '---'}</code></div>
          <div><span className="label">Przekaźników:</span><span>{relays?.length ?? '---'}</span></div>
          <DeviceAddress device={device} />
          <FirmwareStatus device={device} />
          <div className="switch-form-actions">
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
