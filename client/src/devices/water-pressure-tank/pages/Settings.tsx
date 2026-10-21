// Zakładka Ustawienia hydroforu (/settings) w układzie makiety „Instrument” (#s-tank-ustawienia), dwie kolumny:
// po lewej karta „Kompresor” (czas pracy, PUT /device/properties) i „Przepływ pompy” (FlowDetails,
// GET /water-pressure-tank/flow), po prawej karta „Sterownik” (nazwa, SN, Root ID, adres IP, firmware
// z przyciskiem „Aktualizuj” — komponenty core) i „Udostępnianie” (DeviceSharing).
import { FormEvent, useEffect, useState } from 'react';
import { DeviceRequests } from '../../../core/api';
import { canEditDevice, DeviceProperties } from '../../../core/types';
import Notification, { useSaveNotice } from '../../../core/components/Notification';
import { DeviceEditModal } from '../../../core/components/DeviceEditModal';
import { FirmwareStatus } from '../../../core/components/FirmwareStatus';
import { DeviceSharing } from '../../../core/components/DeviceSharing';
import { DeviceAddress } from '../../../core/components/DeviceAddress';
import { IconButton } from '../../../core/components/IconButton';
import { EditIcon } from '../../../core/components/icons';
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
  // przycisk zapisu nieaktywny w trakcie zapisu i dopóki widać komunikat (useSaveNotice)
  const { notice, showNotice, run, busy } = useSaveNotice();
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
    await run(async () => { try {
      const saved = await DeviceRequests.updateDeviceProperties({ ...properties, compressor_seconds: seconds });
      setProperties(saved);
      showNotice('Zapisano. Sterownik pobierze ustawienia przy następnym uruchomieniu pompy.', 4000);
    } catch {
      setError('Nie udało się zapisać ustawień.');
    } });
  };

  return (
    <main className="page page-device tank-page">
      <Notification message={notice} />
      <div className="grid-2 grid-settings">
        <div className="stack">
          <form className="card" onSubmit={save}>
            <header className="card-head"><h2>Kompresor</h2><span className="card-hint">od następnego uruchomienia pompy</span></header>
            <div className="form-grid">
              <label htmlFor="tank-compressor">Czas pracy kompresora</label>
              <div className="range-inputs">
                <input type="number" id="tank-compressor" min={1} max={3600} value={compressor}
                  onChange={(event) => setCompressor(event.currentTarget.value)} />
                <span className="unit-txt">s</span>
              </div>
            </div>
            <p className="help">1–3600 s. Sterownik włącza kompresor raz, 1 s po starcie; zmianę pobiera przy zgłoszeniu.</p>
            {error && <p className="help danger-text">{error}</p>}
            <div className="actions"><button type="submit" className="btn btn-primary" disabled={properties === null || busy}>Zapisz</button></div>
          </form>

          <section className="card">
            <header className="card-head"><h2>Przepływ pompy</h2><span className="card-hint">z wodomierza</span></header>
            <FlowDetails flow={flow} />
          </section>
        </div>

        <div className="stack">
          <section className="card">
            <header className="card-head">
              <h2>Sterownik</h2>
              <IconButton label="Zmień dane sterownika" icon={<EditIcon />} disabled={!canEditDevice(device)} onClick={() => setEditingDevice(true)} />
            </header>
            {/* wiersze jak dl.kv makiety; DeviceAddress i FirmwareStatus (core) dają <div><span class="label">…</span>…</div> */}
            <div className="tank-kv">
              <div><span className="label">Nazwa</span><span>{device?.name?.trim() || '—'}</span></div>
              <div><span className="label">SN</span><code>{device?.deviceId ?? '—'}</code></div>
              <div><span className="label">Root ID</span><code>{device?.rootId ?? '—'}</code></div>
              <DeviceAddress device={device} />
              <FirmwareStatus device={device} actionsClassName="actions tank-kv-actions" />
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
    </main>
  );
};
