// Zakładka Ustawienia kotła pelletowego (/settings): tryb pracy i główne parametry regulatora ze zmianą
// z aplikacji (components/MainParameters.tsx), interwał odpytywania pieca (PUT /device/properties),
// dane sterownika i zwinięty panel „Ustawienia zaawansowane” (wszystkie parametry, podgląd). Strona rysuje się w całości
// dopiero po wczytaniu danych (MainParameters onReady i properties; najpóźniej po READY_TIMEOUT_MS), bez tego sekcje
// dorysowywały się po kolei i strona „mrugała” (2026-10-13).
import { FormEvent, useEffect, useState } from 'react';
import { DeviceRequests } from '../../../core/api';
import { DeviceProperties } from '../../../core/types';
import Notification, { useSaveNotice } from '../../../core/components/Notification';
import { DeviceEditModal } from '../../../core/components/DeviceEditModal';
import { DeviceAddress } from '../../../core/components/DeviceAddress';
import { ControllerCardTitle } from '../../../core/components/ControllerCardTitle';
import { InfoTip } from '../../../core/components/InfoTip';
import { FirmwareStatus } from '../../../core/components/FirmwareStatus';
import { useDevice } from '../../../core/context/DeviceContext';
import { DEFAULT_POLL_SECONDS } from '../utils/boiler';
import { AdvancedSettings } from '../components/AdvancedSettings';
import { MainParameters } from '../components/MainParameters';
import './style.css';

// interwał w pełnych sekundach (jak w ustawieniach urządzenia); do 2026-10-13 w minutach, ale pole liczbowe nie pokazywało
// „0,5” (wartości poniżej minuty)
const MIN_SECONDS = 30;
const MAX_SECONDS = 3600;
const READY_TIMEOUT_MS = 5000;

export const PelletBoilerSettings: React.FC = () => {
  const { device, selectDevice } = useDevice();
  const [properties, setProperties] = useState<DeviceProperties | null>(null);
  const [seconds, setSeconds] = useState('');
  const [mainReady, setMainReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setTimedOut(true), READY_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, []);
  const [error, setError] = useState('');
  // przycisk „Zapisz” nieaktywny w trakcie zapisu i dopóki widać komunikat (useSaveNotice)
  const { notice, showNotice, run, busy } = useSaveNotice();
  const [editingDevice, setEditingDevice] = useState(false);

  useEffect(() => {
    DeviceRequests.getDeviceProperties().then((result) => {
      const loaded = result ?? {};
      setProperties(loaded);
      setSeconds(String(loaded.poll_interval_seconds ?? DEFAULT_POLL_SECONDS));
    });
  }, []);

  // Serwer zastępuje całe properties, dlatego zapis rozszerza wczytany obiekt.
  const save = async (event: FormEvent) => {
    event.preventDefault();
    const value = Number(seconds);
    if (!Number.isInteger(value) || value < MIN_SECONDS || value > MAX_SECONDS) {
      return setError(`Odpytywanie pieca: pełne sekundy ${MIN_SECONDS}–${MAX_SECONDS}.`);
    }
    setError('');
    await run(async () => { try {
      const saved = await DeviceRequests.updateDeviceProperties({
        ...properties,
        poll_interval_seconds: value,
      });
      setProperties(saved);
      showNotice('Zapisano. Sterownik pobierze nową wartość przy następnym wysłaniu danych.', 4000);
    } catch {
      setError('Nie udało się zapisać ustawień.');
    } });
  };

  return (
    <div className="settings boiler-page">
      <Notification message={notice} />
      <h2>Ustawienia</h2>
      {!((mainReady && properties !== null) || timedOut) && <div className="boiler-loading">Wczytywanie…</div>}
      <section style={(mainReady && properties !== null) || timedOut ? undefined : { display: 'none' }}>
        <MainParameters onReady={() => setMainReady(true)} />

        <form className="resource boiler-form" onSubmit={save}>
          <h3 className="settings-section-title">Odpytywanie</h3>
          <label>
            <span className="label">Odpytywanie pieca [s]:<InfoTip>Co ile sekund sterownik odczytuje piec i wysyła dane (30–3600 s, domyślnie 60 s). Krótszy odstęp to szybsza reakcja harmonogramu, cyklu Zimy i ładowania CWU, które korzystają z ostatniego odczytu. Nowa wartość działa od następnej wysyłki sterownika.</InfoTip></span>
            <input type="number" min={MIN_SECONDS} max={MAX_SECONDS} step={1} value={seconds}
              onChange={(event) => setSeconds(event.currentTarget.value)} />
          </label>
          {error && <div className="boiler-error">{error}</div>}
          <div className="boiler-actions">
            <button type="submit" disabled={properties === null || busy}>Zapisz</button>
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
