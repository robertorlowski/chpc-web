// Zakładka Ustawienia fotowoltaiki (/settings), układ „Instrument” z makiety (#s-pv-ustawienia), dwie kolumny
// (.grid-2 .grid-settings). Lewa: „Instalacja” (DTU i mikrofalowniki z numeru seryjnego: model, seria, porty,
// produkcja; GET /photovoltaic/inverters), „Parametry mikrofalownika” (sieć, temperatura, status portów, alarmy,
// łącze DTU) i zwijana lista parametrów DTU i mikrofalowników (utils/parameters.ts,
// docs/moduly/photovoltaic/parametry-i-wykresy.md) — tylko podgląd, zmian z aplikacji nie ma. Prawa: „Sterownik”
// (nazwa z ołówkiem → DeviceEditModal, źródło = sterownik pompy ciepła o tym samym SN, Root ID z „kopiuj”) i
// „Udostępnianie” (core/components/DeviceSharing).
import { useEffect, useState } from 'react';
import { DeviceEditModal } from '../../../core/components/DeviceEditModal';
import { DeviceSharing } from '../../../core/components/DeviceSharing';
import { useDevice } from '../../../core/context/DeviceContext';
import { PhotovoltaicRequests } from '../api';
import { PvInverters } from '../types';
import { PV_PARAMETER_GROUPS } from '../utils/parameters';
import { STATE_LABELS, formatDateTime, formatEnergy, formatTemp, formatTime, shortSerial } from '../utils/pv';
import { EditIcon } from '../components/ui';
import './style.css';

const number = (value: number | undefined, digits = 1) =>
  value === undefined || value === null ? '---' : value.toLocaleString('pl-PL', { maximumFractionDigits: digits });

type Inverter = PvInverters['inverters'][number];

// seria z prefiksu numeru seryjnego, jak w OpenDTU (1144 = HMS 2 porty, 1164 = HMS 4 porty); liczba portów jest w modelu
const seriesLine = (inverter: Inverter) => `seria ${inverter.serial.slice(0, 4)}`;

// „3 · 3 · 3 · 3 (produkcja)” — kody statusu portów surowo (nieudokumentowane), w nawiasie stan z serwera
const portsLine = (inverter: Inverter) => {
  const codes = inverter.ports.map((port) => (port.status === undefined ? '—' : String(port.status))).join(' · ');
  const states = [...new Set(inverter.ports.map((port) => STATE_LABELS[port.state]))].join(', ');
  return { codes, states };
};

// alarmy pogrupowane po kodzie: „kod 9 (porty 1, 2, 3, 4)”
const alarmsLine = (inverter: Inverter) => {
  const byCode = new Map<number, number[]>();
  inverter.ports.filter((port) => port.alarm_code).forEach((port) => byCode.set(port.alarm_code!, [...(byCode.get(port.alarm_code!) ?? []), port.port]));
  const codes = [...byCode].map(([code, ports]) => `kod ${code} (${ports.length === 1 ? 'port' : 'porty'} ${ports.join(', ')})`);
  const count = inverter.ports.reduce((sum, port) => sum + (port.alarm_count ?? 0), 0);
  return { active: codes.length > 0, codes, count };
};

export const PhotovoltaicSettings: React.FC = () => {
  const { device, selectDevice } = useDevice();
  const [inverters, setInverters] = useState<PvInverters | null | undefined>(undefined);
  const [editingDevice, setEditingDevice] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    PhotovoltaicRequests.getInverters().then(setInverters);
  }, []);

  const copyRootId = () => {
    if (!device?.rootId) return;
    navigator.clipboard?.writeText(device.rootId).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }).catch(() => undefined);
  };

  const list = inverters?.inverters ?? [];
  const readHint = inverters?.readAt ? `ostatni odczyt ${formatTime(inverters.readAt)}` : '';

  return (
    <div className="page page-device pv-page">
      <div className="grid-2 grid-settings">
        <div className="stack">
          <section className="card">
            <header className="card-head"><h2>Instalacja</h2><span className="card-hint">z DTU · tylko podgląd</span></header>
            {inverters === undefined && <p className="help">Wczytywanie…</p>}
            {inverters === null && <p className="help danger-text">Nie udało się pobrać danych.</p>}
            {inverters && !list.length && <p className="help">Brak odczytu ze szczegółami paneli.</p>}
            {!!list.length && (
              <dl className="kv">
                <div><dt>DTU</dt><dd>Hoymiles DTU <small>Modbus przez sterownik co</small></dd></div>
                {list.map((inverter) => (
                  <div key={inverter.serial}>
                    <dt>Mikrofalownik</dt>
                    <dd>
                      {inverter.model ?? '---'} <small>{seriesLine(inverter)}</small>
                      <span className="pv-kv-line"><code>{inverter.serial}</code> <small>produkcja {formatEnergy(inverter.prodTotalWh)}</small></span>
                    </dd>
                  </div>
                ))}
                <div><dt>Odczyt</dt><dd>co 60 s przez sterownik pompy ciepła{inverters?.readAt && <small>ostatni {formatDateTime(inverters.readAt)}</small>}</dd></div>
              </dl>
            )}
          </section>

          {list.map((inverter) => {
            const ports = portsLine(inverter);
            const alarms = alarmsLine(inverter);
            const link = inverter.ports.map((port) => port.link);
            const connected = link.length > 0 && link.every((value) => value === 1);
            return (
              <section key={inverter.serial} className="card">
                <header className="card-head">
                  <h2>Parametry mikrofalownika{list.length > 1 ? ` ${shortSerial(inverter.serial)}` : ''}</h2>
                  {readHint && <span className="card-hint">{readHint}</span>}
                </header>
                <dl className="kv">
                  <div><dt>Napięcie sieci</dt><dd>{number(inverter.grid_voltage)} V</dd></div>
                  <div><dt>Częstotliwość</dt><dd>{number(inverter.grid_frequency, 2)} Hz</dd></div>
                  <div><dt>Temperatura</dt><dd>{formatTemp(inverter.temperature)}</dd></div>
                  <div><dt>Status portów</dt><dd>{ports.codes} <small>({ports.states})</small></dd></div>
                  <div>
                    <dt>Alarmy</dt>
                    <dd>
                      {alarms.active ? <span className="danger-text">{alarms.codes.join(', ')}</span> : <span className="ok-text">brak</span>}
                      <small>licznik {alarms.count}</small>
                    </dd>
                  </div>
                  <div><dt>Łącze DTU</dt><dd>{link.length ? [...new Set(link)].map((value) => value ?? '—').join(' · ') : '---'} <small>{connected ? 'połączony' : 'brak łączności'}</small></dd></div>
                </dl>
              </section>
            );
          })}

          <details className="card card-details">
            <summary>
              <h2>Parametry DTU i mikrofalowników</h2>
              <span className="card-hint">tylko podgląd</span>
            </summary>
            <p className="help">
              Lista parametrów, które da się odczytać albo ustawić w DTU Hoymiles i mikrofalownikach. Sterownik co dziś czyta pomiary;
              zmiana ustawień z aplikacji nie jest jeszcze dostępna.
            </p>
            {PV_PARAMETER_GROUPS.map((group) => (
              <div key={group.label} className="pv-param-group">
                <h3 className="pv-param-title">{group.label} <small>({group.parameters.length})</small></h3>
                <ul className="params">
                  {group.parameters.map((parameter) => (
                    <li key={parameter.name}>
                      <span className="param-name">
                        {parameter.name}
                        <small>{parameter.description}{parameter.rating && <em> {parameter.rating}</em>}</small>
                      </span>
                      <span className="param-val"><span className={`chip ${parameter.read ? 'chip-ok' : 'chip-off'}`}>{parameter.read ? 'odczytywany' : parameter.access}</span></span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </details>
        </div>

        <div className="stack">
          <section className="card">
            <header className="card-head">
              <h2>Sterownik</h2>
              <button type="button" className="icon-btn sm" aria-label="Zmień dane sterownika" title="Zmień dane sterownika"
                disabled={!device} onClick={() => setEditingDevice(true)}><EditIcon /></button>
            </header>
            <dl className="kv">
              <div><dt>Nazwa</dt><dd>{device?.name?.trim() || '---'}</dd></div>
              <div><dt>Źródło</dt><dd>sterownik pompy ciepła <code>{device?.deviceId ?? '---'}</code></dd></div>
              <div>
                <dt>Root ID</dt>
                <dd>
                  <code>{device?.rootId ?? '---'}</code>{' '}
                  <button type="button" className="link-btn" disabled={!device} onClick={copyRootId}>{copied ? 'skopiowano' : 'kopiuj'}</button>
                </dd>
              </div>
              <div><dt>Historia</dt><dd>sumy instalacji bez limitu <small>szczegóły paneli 90 dni</small></dd></div>
            </dl>
            <p className="help">Urządzenie PV powstaje samo przy pierwszym odczycie; nie ma własnego firmware ani adresu IP.</p>
          </section>

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
