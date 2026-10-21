// Zakładka Ustawienia kotła pelletowego (/settings), układ „Instrument” (#s-boiler-ustawienia): dwie kolumny
// (.grid-settings). Lewa: tryb pracy i sezon, główne parametry regulatora ze zmianą z aplikacji i ostatnie zmiany
// (components/MainParameters.tsx). Prawa: karta „Odczyt” z interwałem odpytywania pieca (PUT /device/properties),
// zwinięta karta „Ustawienia zaawansowane” (wszystkie parametry, podgląd; components/AdvancedSettings.tsx), karta
// „Sterownik” (nazwa, SN, Root ID, adres IP, firmware z przyciskiem „Aktualizuj”; ołówek otwiera okno „Dane
// sterownika”) i udostępnianie. Strona rysuje się w całości dopiero po wczytaniu danych (MainParameters onReady
// i properties; najpóźniej po READY_TIMEOUT_MS), bez tego sekcje dorysowywały się po kolei i strona „mrugała” (2026-10-13).
import { FormEvent, useEffect, useState } from 'react';
import { DeviceRequests } from '../../../core/api';
import { canEditDevice, DeviceProperties } from '../../../core/types';
import { useAuth } from '../../../core/context/AuthContext';
import Notification, { useSaveNotice } from '../../../core/components/Notification';
import { DeviceEditModal } from '../../../core/components/DeviceEditModal';
import { DeviceAddress } from '../../../core/components/DeviceAddress';
import { FirmwareStatus } from '../../../core/components/FirmwareStatus';
import { DeviceSharing } from '../../../core/components/DeviceSharing';
import { useDevice } from '../../../core/context/DeviceContext';
import { DEFAULT_POLL_SECONDS } from '../utils/boiler';
import { AdvancedSettings } from '../components/AdvancedSettings';
import { MainParameters } from '../components/MainParameters';
import { IconBtn } from '../components/ui';
import { useLang } from '../../../core/i18n';
import './style.css';

// interwał w pełnych sekundach (jak w ustawieniach urządzenia); do 2026-10-13 w minutach, ale pole liczbowe nie pokazywało
// „0,5” (wartości poniżej minuty)
const MIN_SECONDS = 30;
const MAX_SECONDS = 3600;
const READY_TIMEOUT_MS = 5000;

export const PelletBoilerSettings: React.FC = () => {
  const { t } = useLang();
  const { device, selectDevice } = useDevice();
  const isDemo = !!useAuth().user?.isDemo;
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
      return setError(t('pb.set.pollInvalid', { min: MIN_SECONDS, max: MAX_SECONDS }));
    }
    setError('');
    await run(async () => { try {
      const saved = await DeviceRequests.updateDeviceProperties({
        ...properties,
        poll_interval_seconds: value,
      });
      setProperties(saved);
      showNotice(t('pb.set.saved'), 4000);
    } catch {
      setError(t('sw.set.saveFailed'));
    } });
  };

  const ready = (mainReady && properties !== null) || timedOut;

  return (
    <div className="page page-device boiler-page">
      <Notification message={notice} />
      {!ready && <section className="card"><span className="help">{t('common.loading')}</span></section>}
      <div className="grid-2 grid-settings" style={ready ? undefined : { display: 'none' }}>
        <div className="stack">
          <MainParameters onReady={() => setMainReady(true)} />
        </div>
        <div className="stack">
          <form className="card" onSubmit={save}>
            <header className="card-head"><h2>{t('pv.set.reading')}</h2></header>
            <div className="form-grid">
              <label htmlFor="boiler-poll">{t('pb.set.pollInterval')}</label>
              <div className="range-inputs">
                <input id="boiler-poll" className="w-wide" type="number" min={MIN_SECONDS} max={MAX_SECONDS} step={1} value={seconds}
                  onChange={(event) => setSeconds(event.currentTarget.value)} />
                <span className="unit-txt">s</span>
              </div>
            </div>
            <p className="help">{t('pb.set.pollHelp', { min: MIN_SECONDS, max: MAX_SECONDS, default: DEFAULT_POLL_SECONDS })}</p>
            {error && <p className="help danger-text">{error}</p>}
            <div className="actions">
              <button type="submit" className="btn btn-primary" disabled={properties === null || busy}>{t('common.save')}</button>
            </div>
          </form>

          <AdvancedSettings />

          <section className="card">
            <header className="card-head">
              <h2>{t('nav.device')}</h2>
              <IconBtn name="edit" label={t('controller.edit')} disabled={!canEditDevice(device)} onClick={() => setEditingDevice(true)} />
            </header>
            {/* wiersze core (DeviceAddress, FirmwareStatus) mają układ „etykieta: wartość”, więc cała lista jest tak samo rysowana (.boiler-kv) */}
            <div className="boiler-kv">
              <div><span className="label">{t('deviceEdit.name')}:</span><span>{device?.name?.trim() || '---'}</span></div>
              {!isDemo && <div><span className="label">SN:</span><code>{device?.deviceId ?? '---'}</code></div>}
              {!isDemo && <div><span className="label">Root ID:</span><code>{device?.rootId ?? '---'}</code></div>}
              <DeviceAddress device={device} />
              <FirmwareStatus device={device} actionsClassName="actions boiler-kv-actions" />
            </div>
          </section>
          {/* udostępnianie sterownika (tylko właściciel; konta użytkowników) */}
          {device && <DeviceSharing device={device} />}
        </div>
      </div>

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
