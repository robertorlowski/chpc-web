// Zakładka Ustawienia fotowoltaiki (/settings): instalacja odczytana z DTU (mikrofalowniki, porty,
// liczniki, napięcie i częstotliwość sieci; GET /photovoltaic/inverters), lista parametrów DTU i
// mikrofalowników (utils/parameters.ts, docs/moduly/photovoltaic/parametry-i-wykresy.md) — tylko
// podgląd, zmian z aplikacji nie ma — i dane urządzenia (nazwa).
import { useEffect, useState } from 'react';
import { DeviceEditModal } from '../../../core/components/DeviceEditModal';
import { useDevice } from '../../../core/context/DeviceContext';
import { PhotovoltaicRequests } from '../api';
import { PvInverters } from '../types';
import { PV_PARAMETER_GROUPS } from '../utils/parameters';
import { STATE_LABELS, formatDateTime, formatEnergy, formatTemp, shortSerial } from '../utils/pv';
import './style.css';

const number = (value: number | undefined, digits = 1) =>
  value === undefined || value === null ? '---' : value.toLocaleString('pl-PL', { maximumFractionDigits: digits });

export const PhotovoltaicSettings: React.FC = () => {
  const { device, selectDevice } = useDevice();
  const [inverters, setInverters] = useState<PvInverters | null | undefined>(undefined);
  const [editingDevice, setEditingDevice] = useState(false);
  const [showParameters, setShowParameters] = useState(false);

  useEffect(() => {
    PhotovoltaicRequests.getInverters().then(setInverters);
  }, []);

  return (
    <div className="settings pv-page">
      <h2>Ustawienia</h2>
      <section>
        <div className="resource">
          <h3 className="settings-section-title">Instalacja (odczyt z DTU)</h3>
          {inverters === undefined && <div className="pv-hint">Wczytywanie…</div>}
          {inverters === null && <div className="pv-bad">Nie udało się pobrać danych.</div>}
          {inverters && !inverters.inverters.length && <div className="pv-hint">Brak odczytu ze szczegółami paneli.</div>}
          {inverters?.inverters.map((inverter) => (
            <div key={inverter.serial} className="pv-inverter">
              <div className="pv-inverter-title">Mikrofalownik {shortSerial(inverter.serial)}</div>
              <div className="pv-row"><span className="label">Numer seryjny:</span><code>{inverter.serial}</code></div>
              <div className="pv-row"><span className="label">Model:</span><span>{inverter.model ?? '---'} <small className="pv-hint">(z numeru seryjnego)</small></span></div>
              <div className="pv-row"><span className="label">Produkcja całkowita:</span><span>{formatEnergy(inverter.prodTotalWh)}</span></div>
              <div className="pv-row"><span className="label">Sieć:</span><span>{number(inverter.grid_voltage)} V, {number(inverter.grid_frequency, 2)} Hz</span></div>
              <div className="pv-row"><span className="label">Temperatura:</span><span>{formatTemp(inverter.temperature)}</span></div>
              <div className="pv-row">
                <span className="label">Porty:</span>
                <span>{inverter.ports.map((port) => `${port.port}: ${STATE_LABELS[port.state]}`).join(', ')}</span>
              </div>
            </div>
          ))}
          {inverters?.readAt && <div className="pv-hint">Odczyt: {formatDateTime(inverters.readAt)}</div>}
        </div>

        <div className="resource">
          <h3 className="settings-section-title">
            <button type="button" className="pv-toggle" aria-expanded={showParameters} onClick={() => setShowParameters(!showParameters)}>
              <span>Parametry DTU i mikrofalowników</span>
              <span aria-hidden="true">{showParameters ? '▲' : '▼'}</span>
            </button>
          </h3>
          {showParameters && (
            <>
              <div className="pv-hint">
                Lista parametrów, które da się odczytać albo ustawić w DTU Hoymiles i mikrofalownikach. Tylko podgląd:
                sterownik co dziś czyta pomiary, a zmiana ustawień z aplikacji nie jest jeszcze dostępna.
              </div>
              {PV_PARAMETER_GROUPS.map((group) => (
                <details key={group.label} className="pv-group">
                  <summary>{group.label} <span className="pv-hint">({group.parameters.length})</span></summary>
                  <ul>
                    {group.parameters.map((parameter) => (
                      <li key={parameter.name} className="pv-parameter">
                        <div className="pv-parameter-head">
                          <span className="pv-parameter-label">{parameter.name}</span>
                          <span className={`pv-parameter-status ${parameter.read ? 'pv-on' : ''}`}>{parameter.read ? 'odczytywany' : parameter.access}</span>
                        </div>
                        <div className="pv-parameter-description">{parameter.description}</div>
                        {parameter.rating && <div className="pv-parameter-rating">{parameter.rating}</div>}
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </>
          )}
        </div>

        <div className="resource">
          <h3 className="settings-section-title">Urządzenie</h3>
          <div className="pv-row"><span className="label">Nazwa:</span><span>{device?.name?.trim() || '---'}</span></div>
          <div className="pv-row"><span className="label">Identyfikator:</span><code>{device?.deviceId ?? '---'}</code></div>
          <div className="pv-row"><span className="label">Root ID:</span><code>{device?.rootId ?? '---'}</code></div>
          <div className="pv-hint">DTU czyta sterownik pompy ciepła (co) o tym samym identyfikatorze; urządzenie założył serwer.</div>
          <div className="pv-actions">
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
