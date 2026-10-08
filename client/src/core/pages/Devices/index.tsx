// Strona /devices: kafelki sterowników (GET /api/devices i GET /api/devices/summary: stan, kluczowe wartości,
// błąd albo ostrzeżenie), wybór sterownika kliknięciem kafelka, ołówek otwierający popup „Dane sterownika”,
// trybik firmware i tryb „Zmień kolejność” (strzałki, zapis PUT /api/devices/order przy „Gotowe”).
// Nie ma sterownika domyślnego ani automatycznego wyboru: lista jest zawsze ekranem startowym (DeviceGuard
// przekierowuje tu, gdy nie wybrano sterownika). Na dole własna stopka: lewa część wolna (zarezerwowana
// na później), po prawej zajętość bazy danych (GET /api/devices/db-stats).
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { DeviceRequests } from '../../api';
import { DatabaseStats, Device, DeviceTiles, DeviceType } from '../../types';
import { getDeviceTypeView } from '../../device-types';
import { DeviceEditModal } from '../../components/DeviceEditModal';
import { DeviceTileCard } from '../../components/DeviceTileCard';
import { SettingsIcon } from '../../components/icons';
import { Pictogram } from '../../components/pictograms';
import { useDevice } from '../../context/DeviceContext';
import './style.css';

const MB = 1024 * 1024;
const megabytes = (bytes: number) => (bytes / MB).toLocaleString('pl-PL', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
// próg ostrzeżenia o zapełnieniu bazy (żółty tekst)
const DATABASE_WARNING_PERCENT = 80;

// Zajętość bazy (dane + indeksy) względem limitu planu Atlas M0 jako procent („Baza danych 44%”), szczegóły w
// podpowiedzi po najechaniu; „nie odpowiada”, gdy serwer nie ma połączenia.
function DatabaseUsage() {
  const [stats, setStats] = useState<DatabaseStats | null | undefined>(undefined);
  useEffect(() => { DeviceRequests.getDatabaseStats().then(setStats); }, []);
  if (stats === undefined) return <span className="devices-footer-db">Baza danych: …</span>;
  if (!stats?.ok) return <span className="devices-footer-db devices-footer-db-error">Baza danych: nie odpowiada</span>;
  const percent = Math.round((stats.usedBytes / stats.limitBytes) * 100);
  return (
    <span className={`devices-footer-db${percent >= DATABASE_WARNING_PERCENT ? ' devices-footer-db-warning' : ''}`}
      title={`Zajęte ${megabytes(stats.usedBytes)} MB z ${megabytes(stats.limitBytes)} MB, wolne ${megabytes(Math.max(stats.limitBytes - stats.usedBytes, 0))} MB. Dane ${megabytes(stats.dataBytes)} MB, indeksy ${megabytes(stats.indexBytes)} MB; ${stats.collections} kolekcji, ${stats.documents.toLocaleString('pl-PL')} dokumentów; odpowiedź bazy ${stats.pingMs} ms`}>
      <span className="devices-footer-db-dot" aria-hidden="true" />
      Baza danych {percent}%
    </span>
  );
}

// Kafelek ma zawsze nazwę (bez numeru seryjnego): gdy użytkownik jej nie nadał, nazwę rodzaju, a przy kilku
// takich samych sterownikach bez nazwy dopisuje końcówkę numeru, żeby dało się je odróżnić.
const DEFAULT_NAMES: Record<DeviceType, string> = {
  [DeviceType.HP]: 'Pompa ciepła',
  [DeviceType.WATER_PRESSURE_TANK]: 'Hydrofor',
  [DeviceType.PELLET_BOILER_PELUX200]: 'Piec Pellux 200',
  [DeviceType.SWITCH]: 'Włącznik',
  [DeviceType.PHOTOVOLTAIC]: 'Fotowoltaika',
};

export function tileName(device: Device, all: Device[]): string {
  const name = device.name?.trim();
  if (name) return name;
  const base = DEFAULT_NAMES[device.deviceType] ?? device.deviceType;
  const same = all.filter((item) => !item.name?.trim() && item.deviceType === device.deviceType);
  return same.length > 1 ? `${base} …${device.deviceId.slice(-4)}` : base;
}

// miejsce w górnym pasku (App.tsx), do którego strona wstawia trybik „Zmień kolejność”
export const DEVICES_HEADER_ACTIONS_ID = 'devices-header-actions';

// liczba kafelków z poprzedniej wizyty: tyle duszków pokazuje strona, zanim przyjdzie lista (localStorage może
// być niedostępny, więc każdy odczyt i zapis jest w try/catch)
const DEVICE_COUNT_KEY = 'chpc.deviceCount';
const rememberedDeviceCount = (): number => {
  try {
    const count = Number(localStorage.getItem(DEVICE_COUNT_KEY));
    return Number.isInteger(count) && count > 0 && count <= 12 ? count : 3;
  } catch {
    return 3;
  }
};
const rememberDeviceCount = (count: number) => {
  try { localStorage.setItem(DEVICE_COUNT_KEY, String(count)); } catch { /* bez zapamiętania */ }
};

// odświeżanie stanu kafelków i wieku danych w stopce kafelka
const TILES_REFRESH_MS = 30 * 1000;

// Sterowniki rejestrują się same (POST /api/devices/register), więc tu można je tylko wybrać i nazwać.
export const Devices: React.FC = () => {
  const navigate = useNavigate();
  const { clearDevice, selectDevice } = useDevice();
  const [devices, setDevices] = useState<Device[]>([]);
  const [tiles, setTiles] = useState<DeviceTiles>({});
  // do czasu pierwszej odpowiedzi kafelki pokazują duszki (stała wysokość, bez „rozszerzania się” po załadowaniu)
  const [devicesLoaded, setDevicesLoaded] = useState(false);
  const [tilesLoaded, setTilesLoaded] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Device | null>(null);
  // tryb „Zmień kolejność”: kafelki dostają strzałki, wybór sterownika jest wyłączony; kolejność
  // zapisuje dopiero „Gotowe”, „Anuluj” przywraca listę z serwera
  const [reordering, setReordering] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);

  const loadDevices = () => {
    DeviceRequests.getDevices()
      .then((list) => {
        if (list) {
          setDevices(list);
          rememberDeviceCount(list.length);
        } else {
          setError('Nie udało się pobrać urządzeń.');
        }
      })
      .catch(() => setError('Nie udało się pobrać urządzeń.'))
      .finally(() => setDevicesLoaded(true));
  };

  const loadTiles = () => {
    DeviceRequests.getDeviceTiles().then((result) => {
      if (result) setTiles(result);
      setTilesLoaded(true);
      setNow(Date.now());
    });
  };

  // wejście na listę kasuje bieżący wybór (także w localStorage): menu i stopka znikają, a powrót
  // do widoków jest możliwy tylko przez wybór kafelka
  useEffect(() => {
    clearDevice();
    setHeaderSlot(document.getElementById(DEVICES_HEADER_ACTIONS_ID));
    loadDevices();
    loadTiles();
    const timer = window.setInterval(loadTiles, TILES_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  const chooseDevice = (device: Device) => {
    selectDevice(device);
    navigate('/');
  };

  const moveDevice = (index: number, step: -1 | 1) => {
    setDevices((list) => {
      const target = index + step;
      if (target < 0 || target >= list.length) return list;
      const next = [...list];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const saveOrder = async () => {
    setSavingOrder(true);
    try {
      const sorted = await DeviceRequests.setDevicesOrder(devices.map((device) => device.rootId));
      if (!sorted) throw new Error('order');
      setDevices(sorted);
      setReordering(false);
      setError('');
    } catch {
      setError('Nie udało się zapisać kolejności.');
    } finally {
      setSavingOrder(false);
    }
  };

  const cancelOrder = () => {
    setReordering(false);
    setError('');
    loadDevices();
  };

  const saved = (updated: Device) => {
    setDevices((list) => list.map((device) => device.rootId === updated.rootId ? updated : device));
    setEditing(null);
  };

  return (
    <main className="device-selection">
      <h1>Lista urządzeń</h1>
      {/* trybik w górnym pasku włącza tryb „Zmień kolejność” (przy co najmniej dwóch sterownikach) */}
      {headerSlot && devices.length > 1 && createPortal(
        <button type="button" className={`header-gear${reordering ? ' active' : ''}`} disabled={reordering}
          title="Zmień kolejność" aria-label="Zmień kolejność kafelków" onClick={() => setReordering(true)}>
          <SettingsIcon />
        </button>,
        headerSlot,
      )}
      {reordering && (
        <div className="device-reorder-bar">
          <button type="button" onClick={saveOrder} disabled={savingOrder}>Gotowe</button>
          <button type="button" onClick={cancelOrder} disabled={savingOrder}>Anuluj</button>
          <span>Ustaw kolejność strzałkami na kafelkach.</span>
        </div>
      )}
      {error && <p className="device-selection-error">{error}</p>}
      <section className="device-list">
        {devices.map((device, index) => {
          const label = tileName(device, devices);
          const tile = tiles[device.rootId];
          return (
            <div key={device.rootId} className={`device-card${reordering ? ' reordering' : ''}${tile?.level === 'err' ? ' has-error' : ''}`}>
              <button type="button" className="device-choose" disabled={reordering} onClick={() => chooseDevice(device)}>
                <DeviceTileCard deviceType={device.deviceType} name={label} tile={tile} now={now} loading={!tilesLoaded} />
              </button>
              {reordering ? (
                <div className="device-reorder-arrows">
                  <button type="button" className="device-move" disabled={index === 0}
                    title="Przesuń wcześniej" aria-label={`Przesuń ${label} wcześniej`} onClick={() => moveDevice(index, -1)}>
                    <Pictogram name="chevron-left" />
                  </button>
                  <button type="button" className="device-move" disabled={index === devices.length - 1}
                    title="Przesuń później" aria-label={`Przesuń ${label} później`} onClick={() => moveDevice(index, 1)}>
                    <Pictogram name="chevron-right" />
                  </button>
                </div>
              ) : (
                <div className="device-tools">
                  {getDeviceTypeView(device.deviceType).firmwareUpdates && (
                    <button
                      type="button"
                      className="device-firmware"
                      title="Firmware tego rodzaju sterownika"
                      aria-label={`Firmware rodzaju sterownika ${label}`}
                      onClick={() => navigate(`/firmware/${encodeURIComponent(device.deviceType)}`)}
                    >
                      <SettingsIcon />
                    </button>
                  )}
                  <button
                    type="button"
                    className="device-edit"
                    title="Edytuj dane sterownika"
                    aria-label={`Edytuj dane sterownika ${label}`}
                    onClick={() => setEditing(device)}
                  >
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                      <path d="M4 20H8L18.5 9.5C19.3 8.7 19.3 7.3 18.5 6.5L17.5 5.5C16.7 4.7 15.3 4.7 14.5 5.5L4 16V20Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                      <path d="M13 7L17 11" stroke="currentColor" strokeWidth="2" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {!devicesLoaded && !error && Array.from({ length: rememberedDeviceCount() }, (_, index) => (
          <div key={`skeleton-${index}`} className="device-card">
            <div className="device-choose" aria-hidden="true">
              <DeviceTileCard now={now} loading />
            </div>
          </div>
        ))}
        {devicesLoaded && devices.length === 0 && !error && (
          <p>Brak sterowników. Sterownik pojawi się tutaj sam po pierwszym połączeniu z internetem.</p>
        )}
      </section>

      {editing && <DeviceEditModal device={editing} onClose={() => setEditing(null)} onSaved={saved} />}

      <footer className="device-footer devices-footer">
        {/* lewa część zarezerwowana na później (plan 2026-10-04) */}
        <span />
        <DatabaseUsage />
      </footer>
    </main>
  );
};
