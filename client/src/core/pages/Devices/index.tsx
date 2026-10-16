// Strona /devices: szachownica kafelków sterowników i kafelków pogody (GET /api/devices, /devices/summary,
// /weather-tiles; wzór z projektanta kafelka, GET /api/devices/tile-template). Każdy kafelek ma numer pola
// (sortOrder); kolumn tyle, ile mieści szerokość (1–4), puste pola na komputerze zostają puste, na telefonie
// (jedna kolumna) kafelki idą po kolei. Wybór sterownika kliknięciem kafelka, ołówek: popup „Dane sterownika” albo
// „Kafelek pogody”. Trybik w górnym pasku włącza „Zmień układ”: „Przenieś” i wybór pola (zamiana, gdy zajęte),
// puste pola z „+” (nowy kafelek pogody w tym miejscu), oko (ukrycie kafelka: PUT /devices/:rootId {hidden} albo
// PUT /weather-tiles/:id, od razu), „Projekt kafelka”; „Gotowe” zapisuje układ (PUT /api/devices/order z null
// w pustych polach). Ukryte kafelki widać tylko w tym trybie (wyszarzone). Kafelek „Dom” pokazuje temperaturę
// z czujnika kotła (GET /temperature), gdy jest świeża. Nie ma sterownika domyślnego ani automatycznego wyboru:
// lista jest zawsze ekranem startowym (DeviceGuard przekierowuje tu, gdy nie wybrano sterownika). Na dole własna
// stopka: lewa część wolna, po prawej zajętość bazy danych (GET /api/devices/db-stats).
// Konta użytkowników: każde konto ma własny układ szachownicy, ukryte kafelki i kafelki pogody (zapis w koncie,
// PUT /devices/order, PUT /devices/:rootId {hidden}); ołówek tylko przy własnych sterownikach (udostępnione: zakładki
// w podpowiedzi), trybik firmware, „Projekt kafelka” i zajętość bazy tylko dla użytkownika systemowego.
// Kafelki odświeżają się jak ekran główny pompy: po komunikacie WebSocket „update” któregokolwiek sterownika (jedno
// połączenie ?rootIds=…, najwyżej raz na TILES_UPDATE_MIN_MS) i co TILES_REFRESH_MS, gdy żaden nic nie wysyła.
import { CSSProperties, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { DeviceRequests, WeatherTileRequests } from '../../api';
import { wsAddressServer } from '../../http';
import { DatabaseStats, Device, DeviceTiles, DeviceType, OutdoorConditions, WeatherTile } from '../../types';
import { getDeviceTypeView } from '../../device-types';
import { DeviceEditModal } from '../../components/DeviceEditModal';
import { TemplateTile, weatherSlots } from '../../components/TemplateTile';
import { precipitationText, weatherDescription, WeatherIcon } from '../../components/WeatherIcon';
import { WeatherTileModal } from '../../components/WeatherTileModal';
import { cachedTemplate, cacheTemplate, normalizeTemplate, TILE_TEMPLATE, TileTemplate } from '../../tile-template';
import { SettingsIcon } from '../../components/icons';
import { useDevice } from '../../context/DeviceContext';
import { useAuth } from '../../context/AuthContext';
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

// Ostatni stan listy w localStorage (sterowniki, dane kafelków, kafelki pogody, temperatura): po otwarciu lista
// rysuje się od razu w znanym układzie i rozmiarze, a dane z serwera (ok. 2 s) podmieniają go w tle. Wiek danych
// w stopkach liczy się z czasu odczytu, więc stare dane nie udają świeżych.
// klucze osobno dla konta: po przelogowaniu nie widać przez chwilę cudzych kafelków
const cacheKeys = (userId = '') => ({
  devices: `chpc.devices.${userId}`, tiles: `chpc.deviceTiles.${userId}`, weather: `chpc.weatherTiles.${userId}`, outdoor: 'chpc.outdoor',
});
function readCache<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback;
  } catch {
    return fallback;
  }
}
function writeCache(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* bez pamięci podręcznej */ }
}

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

// Podpowiedź na kafelku udostępnionego sterownika: właściciel i zakładki z dostępem (kafelek ma stały rozmiar,
// więc bez dodatkowego wiersza jak przy sekcjach właścicieli).
function sharedInfo(device: Device): string | undefined {
  if (device.access !== 'shared') return undefined;
  const view = getDeviceTypeView(device.deviceType);
  const tabs = (device.tabs ?? []).map((path) => path === '/' ? 'Podgląd' : view.views.find((entry) => entry.path === path)?.label ?? path);
  const owner = device.owner?.name || device.owner?.email;
  return `${owner ? `Udostępnia: ${owner}. ` : ''}Dostęp: ${tabs.join(', ')}`;
}

// odświeżanie stanu kafelków i wieku danych w stopce kafelka
const TILES_REFRESH_MS = 30 * 1000;
// po „update” z WebSocket: kafelki najwyżej raz na tyle (pompa wysyła co 10–30 s, włącznik przy każdej zmianie)
const TILES_UPDATE_MIN_MS = 5 * 1000;

// kafelek na szachownicy: sterownik albo kafelek pogody; pole = sortOrder
type ListItem = { kind: 'device'; id: string; device: Device } | { kind: 'weather'; id: string; weather: WeatherTile };
const rank = (item: ListItem) => (item.kind === 'device' ? item.device.sortOrder : item.weather.sortOrder);
const isHidden = (item: ListItem) => item.kind === 'device' ? !!item.device.hidden : item.weather.hidden;
const itemLabel = (item: ListItem, devices: Device[]) => item.kind === 'device' ? tileName(item.device, devices) : item.weather.name;

// Pola szachownicy z sortOrder: kafelek z numerem pola dostaje je, gdy wolne; bez numeru (nowy sterownik), z ujemnym
// (kafelek „Dom” przed sterownikami) albo przy zajętym polu dostaje pierwsze wolne. Wynik: tablica pól (id albo null).
function assignSlots(items: ListItem[]): (string | null)[] {
  const cells: (string | null)[] = [];
  const sorted = [...items].sort((a, b) => (rank(a) ?? Number.MAX_SAFE_INTEGER) - (rank(b) ?? Number.MAX_SAFE_INTEGER));
  const firstFree = () => { let i = 0; while (cells[i]) i += 1; return i; };
  sorted.forEach((item) => {
    const wanted = rank(item);
    const slot = wanted !== undefined && wanted >= 0 && !cells[wanted] ? wanted : firstFree();
    cells[slot] = item.id;
  });
  for (let i = 0; i < cells.length; i += 1) if (cells[i] === undefined) cells[i] = null;
  return cells;
}

// liczba kolumn szachownicy z szerokości miejsca: tyle kafelków 300 px z odstępem, ile się mieści (1–4)
const MAX_COLUMNS = 4;

// Sterowniki rejestrują się same (POST /api/devices/register), więc tu można je tylko wybrać i nazwać.
export const Devices: React.FC = () => {
  const navigate = useNavigate();
  const { clearDevice, selectDevice } = useDevice();
  const { user } = useAuth();
  const isSystem = !!user?.isSystem;
  const CACHE_KEYS = cacheKeys(user?.id);
  const [devices, setDevices] = useState<Device[]>(() => readCache(CACHE_KEYS.devices, []));
  const [weatherTiles, setWeatherTiles] = useState<WeatherTile[]>(() => readCache(CACHE_KEYS.weather, []));
  // pola szachownicy w trybie „Zmień układ” (id albo null), do zapisu przy „Gotowe”
  const [cells, setCells] = useState<(string | null)[] | null>(null);
  // kafelek wybrany „Przenieś”: następne kliknięcie pola go tam stawia (zamiana, gdy zajęte)
  const [moving, setMoving] = useState<string | null>(null);
  // „+” w pustym polu: nowy kafelek pogody trafi do tego pola
  const [addAt, setAddAt] = useState<number | null>(null);
  // liczba kolumn z szerokości listy
  const listRef = useRef<HTMLElement>(null);
  const [columns, setColumns] = useState(MAX_COLUMNS);
  // popup „Kafelek pogody”: null = nowy, undefined = zamknięty
  const [editingWeather, setEditingWeather] = useState<WeatherTile | null | undefined>(undefined);
  const [tiles, setTiles] = useState<DeviceTiles>(() => readCache(CACHE_KEYS.tiles, {}));
  // do czasu pierwszej odpowiedzi kafelki pokazują duszki (stała wysokość, bez „rozszerzania się” po załadowaniu)
  const [devicesLoaded, setDevicesLoaded] = useState(false);
  const [tilesLoaded, setTilesLoaded] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Device | null>(null);
  // tryb „Zmień układ”: kafelki dostają przyciski, wybór sterownika jest wyłączony; układ
  // zapisuje dopiero „Gotowe”, „Anuluj” przywraca listę z serwera
  const [reordering, setReordering] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  // temperatura z czujnika kotła i pogoda z Open-Meteo (GET /temperature), odświeżane razem z kafelkami;
  // undefined = wczytywanie
  const [outdoor, setOutdoor] = useState<OutdoorConditions | null | undefined>(() => readCache<OutdoorConditions | undefined>(CACHE_KEYS.outdoor, undefined));
  // wzór kafelka (projektant kafelka): najpierw ostatni znany z localStorage, potem z serwera
  const [template, setTemplate] = useState<TileTemplate>(cachedTemplate);

  const loadDevices = () => {
    DeviceRequests.getDevices()
      .then((list) => {
        if (list) {
          setDevices(list);
          writeCache(CACHE_KEYS.devices, list);
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
      if (result) { setTiles(result); writeCache(CACHE_KEYS.tiles, result); }
      setTilesLoaded(true);
      setNow(Date.now());
    });
    DeviceRequests.getOutdoorConditions().then((result) => { setOutdoor(result); if (result) writeCache(CACHE_KEYS.outdoor, result); });
    WeatherTileRequests.list().then((result) => { if (result) { setWeatherTiles(result); writeCache(CACHE_KEYS.weather, result); } });
  };

  // wejście na listę kasuje bieżący wybór (także w localStorage): menu i stopka znikają, a powrót
  // do widoków jest możliwy tylko przez wybór kafelka
  useEffect(() => {
    clearDevice();
    DeviceRequests.getTileTemplate().then((result) => {
      if (result === undefined) return;
      const next = normalizeTemplate(result) ?? TILE_TEMPLATE;
      setTemplate(next);
      cacheTemplate(result ? next : null);
    });
    setHeaderSlot(document.getElementById(DEVICES_HEADER_ACTIONS_ID));
    loadDevices();
    loadTiles();
    const timer = window.setInterval(loadTiles, TILES_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  // „update” któregokolwiek sterownika: kafelki od nowa (z ograniczeniem częstości); połączenie od nowa przy zmianie listy
  const rootIdsKey = devices.map((device) => device.rootId).sort().join(',');
  const lastTilesLoad = useRef(0);
  const pendingTilesLoad = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!rootIdsKey) return undefined;
    const reload = () => {
      pendingTilesLoad.current = undefined;
      lastTilesLoad.current = Date.now();
      loadTiles();
    };
    const wsUrl = new URL(wsAddressServer());
    wsUrl.searchParams.set('rootIds', rootIdsKey);
    const ws = new WebSocket(wsUrl.toString());
    ws.onmessage = (event) => {
      try {
        if ((JSON.parse(event.data) as { type?: string }).type !== 'update' || pendingTilesLoad.current !== undefined) return;
        const wait = Math.max(0, lastTilesLoad.current + TILES_UPDATE_MIN_MS - Date.now());
        pendingTilesLoad.current = window.setTimeout(reload, wait);
      } catch { /* inne komunikaty */ }
    };
    return () => {
      ws.close();
      window.clearTimeout(pendingTilesLoad.current);
      pendingTilesLoad.current = undefined;
    };
  }, [rootIdsKey]);

  const chooseDevice = (device: Device) => {
    selectDevice(device);
    navigate('/');
  };

  // liczba kolumn: z szerokości listy i szerokości kafelka ze wzoru (300/340 w + odstęp)
  const gap = template.gap ?? TILE_TEMPLATE.gap ?? 16;
  useEffect(() => {
    const element = listRef.current;
    if (!element) return undefined;
    const minWidth = Math.round(template.w * 300 / 340);
    const observer = new ResizeObserver(([entry]) => {
      setColumns(Math.max(1, Math.min(MAX_COLUMNS, Math.floor((entry.contentRect.width + gap) / (minWidth + gap)))));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [template.w, gap]);

  // wszystkie kafelki i ich pola; w trybie edycji według lokalnego układu
  const allItems: ListItem[] = [
    ...devices.map((device): ListItem => ({ kind: 'device', id: device.rootId, device })),
    ...weatherTiles.map((weather): ListItem => ({ kind: 'weather', id: weather.id, weather })),
  ];
  const byId = new Map(allItems.map((item) => [item.id, item]));
  const layout = cells ?? assignSlots(allItems);
  // poza trybem edycji ukryte kafelki znikają (pole zostaje puste)
  const visibleLayout = reordering ? layout : layout.map((id) => id && byId.get(id) && !isHidden(byId.get(id)!) ? id : null);
  // telefon (jedna kolumna): bez pustych pól; komputer w trybie edycji: cały prostokąt pól plus jeden wolny wiersz
  const occupied = visibleLayout.map((id, index) => ({ id, index })).filter(({ id }) => id && byId.has(id));
  const lastSlot = occupied.length ? occupied[occupied.length - 1].index : -1;
  const rows = Math.ceil((lastSlot + 1) / columns) + (reordering ? 1 : 0);
  const cellIndexes = columns === 1
    ? [...occupied.map(({ index }) => index), ...(reordering ? [lastSlot + 1] : [])]
    : Array.from({ length: rows * columns }, (_, index) => index);
  // Pusty wiersz w układzie dzieli listę (decyzja użytkownika 2026-10-16): kafelki pod pierwszym pustym wierszem
  // stoją przy dole ekranu (odstęp między częściami wypełnia wolne miejsce). W trybie edycji pusty wiersz widać
  // jako puste pola. Na telefonie (jedna kolumna) pustym wierszem jest puste pole między kafelkami.
  const rowOf = (slot: number) => columns === 1 ? slot : Math.floor(slot / columns);
  const emptyRow = (() => {
    if (reordering) return -1;
    for (let row = 0; row < rowOf(lastSlot); row += 1) {
      const start = columns === 1 ? row : row * columns;
      const end = columns === 1 ? row + 1 : start + columns;
      if (visibleLayout.slice(start, end).every((id) => !id || !byId.has(id))) return row;
    }
    return -1;
  })();
  const topCells = emptyRow < 0 ? cellIndexes : cellIndexes.filter((slot) => rowOf(slot) < emptyRow);
  const bottomCells = emptyRow < 0 ? [] : cellIndexes.filter((slot) => rowOf(slot) > emptyRow);
  // odstęp między częściami: tyle, żeby dolna część kończyła się nad stałą stopką (mierzone po każdej zmianie
  // układu i okna; wartości w px listy, która na komputerze ma zoom 0,9)
  const bottomRef = useRef<HTMLElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const [spacer, setSpacer] = useState(0);
  // dolna część mieści się nad stopką: bez dolnego marginesu listy (inaczej margines zostaje, żeby ostatni kafelek
  // dało się przewinąć nad stałą stopkę)
  const [bottomFits, setBottomFits] = useState(false);
  const layoutKey = `${visibleLayout.join(',')}|${columns}|${emptyRow}|${template.h}`;
  useLayoutEffect(() => {
    const measure = () => {
      const bottom = bottomRef.current;
      const spacerElement = spacerRef.current;
      if (!bottom || !spacerElement) { setSpacer(0); setBottomFits(false); return; }
      const footer = document.querySelector<HTMLElement>('.device-footer');
      const limit = window.innerHeight - (footer?.offsetHeight ?? 0) - 10;
      // lista na komputerze ma zoom 0,9 (ustawiony na .device-selection; na potomkach computed zoom = 1)
      const zoom = Number(getComputedStyle(bottom.closest('.device-selection') ?? bottom).zoom) || 1;
      // bez zerowania odstępu w DOM (React nie przywróciłby go przy tej samej wartości): bieżący odstęp się dolicza
      const free = (limit - bottom.getBoundingClientRect().bottom + spacerElement.getBoundingClientRect().height) / zoom;
      // co najmniej zwykły odstęp między kafelkami: na telefonie i przy długiej liście dolna część nie przykleja się do górnej
      setSpacer(Math.max(gap, Math.round(free)));
      setBottomFits(free >= gap);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [layoutKey, tilesLoaded, gap]);

  const startReordering = () => {
    setCells(assignSlots(allItems));
    setMoving(null);
    setReordering(true);
  };

  // „Przenieś” → kliknięcie pola: postawienie w pustym polu albo zamiana z kafelkiem, który tam stoi
  const placeAt = (slot: number) => {
    if (!moving) return;
    setCells((current) => {
      const next = [...(current ?? layout)];
      while (next.length <= slot) next.push(null);
      const from = next.indexOf(moving);
      const other = next[slot];
      next[slot] = moving;
      if (from >= 0) next[from] = other;
      return next;
    });
    setMoving(null);
  };

  const saveOrder = async () => {
    setSavingOrder(true);
    try {
      const trimmed = [...layout];
      while (trimmed.length && trimmed[trimmed.length - 1] === null) trimmed.pop();
      const sorted = await DeviceRequests.setDevicesOrder(trimmed);
      if (!sorted) throw new Error('order');
      setDevices(sorted);
      const refreshed = await WeatherTileRequests.list();
      if (refreshed) setWeatherTiles(refreshed);
      setReordering(false);
      setCells(null);
      setMoving(null);
      setError('');
    } catch {
      setError('Nie udało się zapisać układu.');
    } finally {
      setSavingOrder(false);
    }
  };

  const cancelOrder = () => {
    setReordering(false);
    setCells(null);
    setMoving(null);
    setError('');
    loadDevices();
  };

  // ukrycie / pokazanie od razu (nie czeka na „Gotowe”)
  const toggleHidden = async (item: ListItem) => {
    try {
      if (item.kind === 'device') {
        const updated = await DeviceRequests.setDeviceHidden(item.id, !item.device.hidden);
        setDevices((list) => list.map((device) => device.rootId === item.id ? { ...device, hidden: updated.hidden } : device));
      } else {
        const updated = await WeatherTileRequests.update(item.id, { hidden: !item.weather.hidden });
        setWeatherTiles((list) => list.map((tile) => tile.id === item.id ? updated : tile));
      }
    } catch {
      setError('Nie udało się zmienić widoczności kafelka.');
    }
  };

  // nowy kafelek pogody: do wybranego pola („+”) albo pierwszego wolnego za ostatnim; w trybie edycji w lokalnym układzie
  const weatherSaved = (tile: WeatherTile) => {
    const isNew = !weatherTiles.some((item) => item.id === tile.id);
    setWeatherTiles((list) => isNew ? [...list, tile] : list.map((item) => item.id === tile.id ? tile : item));
    if (isNew && cells) {
      setCells((current) => {
        const next = [...(current ?? [])];
        const slot = addAt ?? next.length;
        while (next.length <= slot) next.push(null);
        if (next[slot]) next.push(tile.id); else next[slot] = tile.id;
        return next;
      });
    }
    setAddAt(null);
    setEditingWeather(undefined);
  };

  const weatherRemoved = (id: string) => {
    setWeatherTiles((list) => list.filter((item) => item.id !== id));
    setCells((current) => current ? current.map((cell) => cell === id ? null : cell) : current);
    setEditingWeather(undefined);
  };

  const saved = (updated: Device) => {
    setDevices((list) => list.map((device) => device.rootId === updated.rootId ? updated : device));
    setEditing(null);
  };

  return (
    <>
    <main className={`device-selection${bottomCells.length && bottomFits ? ' has-bottom' : ''}`}>
      <h1>Lista urządzeń</h1>
      {/* trybik w górnym pasku włącza tryb „Zmień układ” (pola, ukrywanie, kafelki pogody, projekt kafelka) */}
      {headerSlot && devicesLoaded && createPortal(
        <button type="button" className={`header-gear${reordering ? ' active' : ''}`} disabled={reordering}
          title="Zmień układ" aria-label="Zmień układ kafelków" onClick={startReordering}>
          <SettingsIcon />
        </button>,
        headerSlot,
      )}
      {reordering && (
        <div className="device-reorder-bar">
          <span>{moving ? 'Kliknij pole, w którym ma stanąć kafelek.' : '„Przenieś” i wybór pola ustawiają układ, „+” w pustym polu dodaje pogodę, oko ukrywa kafelek, pusty wiersz spycha resztę do dołu ekranu.'}</span>
          <div className="device-reorder-buttons">
            <button type="button" onClick={() => { setAddAt(null); setEditingWeather(null); }} disabled={savingOrder}>Dodaj kafelek pogody</button>
            {/* wzór kafelka jest wspólny dla wszystkich kont: zmienia go tylko użytkownik systemowy */}
            {isSystem && <button type="button" onClick={() => navigate('/tile-designer')} disabled={savingOrder}>Projekt kafelka</button>}
            <button type="button" onClick={cancelOrder} disabled={savingOrder}>Anuluj</button>
            <button type="button" onClick={saveOrder} disabled={savingOrder}>Gotowe</button>
          </div>
        </div>
      )}
      {error && <p className="device-selection-error">{error}</p>}
      {/* temperatura domu z czujnika kotła (bez niego z prognozy); niebo, opady i wiatr z Open-Meteo nad pierwszym
          wierszem (zostaje mimo kafelka „Dom”, decyzja użytkownika 2026-10-16); na telefonie bez opadów i wiatru */}
      <div className="devices-outdoor" title={outdoor?.temperatureSource === 'forecast'
        ? 'Temperatura i pogoda: prognoza Open-Meteo (brak odczytu z czujnika kotła).'
        : 'Temperatura: czujnik zewnętrzny kotła. Pogoda: prognoza Open-Meteo.'}>
        {outdoor?.weather && <WeatherIcon weather={outdoor.weather} />}
        <span>
          <b>{outdoor === undefined ? '…' : typeof outdoor?.temperature === 'number'
            ? `${outdoor.temperature.toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} °C` : '--- °C'}</b>
          {outdoor?.temperatureSource === 'forecast' && <span className="devices-outdoor-extra"> (prognoza)</span>}
          {outdoor?.weather && <> {weatherDescription(outdoor.weather.code)}</>}
        </span>
        {outdoor?.weather && (
          <span className="devices-outdoor-extra">
            {precipitationText(outdoor.weather)} · wiatr {Math.round(outdoor.weather.windSpeed)} km/h
          </span>
        )}
      </div>
      {(() => {
        const gridStyle = { gap, '--cols': columns, '--tile-max': `${template.w}px` } as CSSProperties;
        // pola dolnej części są numerowane od jej pierwszego wiersza (grid-row liczony od 1)
        const renderCell = (slot: number, rowOffset: number) => {
          const id = visibleLayout[slot];
          const item = id ? byId.get(id) : undefined;
          const position = columns === 1 ? undefined : { gridColumn: slot % columns + 1, gridRow: Math.floor(slot / columns) + 1 - rowOffset };
          if (!item) {
            if (!reordering) return null;
            return (
              <div key={`empty-${slot}`} className="device-cell-empty" style={{ ...position, aspectRatio: `${template.w} / ${template.h}` }}>
                {moving ? (
                  <button type="button" className="device-cell-place" onClick={() => placeAt(slot)}>Wstaw tutaj</button>
                ) : (
                  <button type="button" className="device-cell-add" title="Dodaj kafelek pogody w tym polu"
                    onClick={() => { setAddAt(slot); setEditingWeather(null); }}>
                    <b>+</b><span>pogoda</span>
                  </button>
                )}
              </div>
            );
          }
          const label = itemLabel(item, devices);
          const hidden = isHidden(item);
          const tile = item.kind === 'device' ? tiles[item.device.rootId] : undefined;
          const classes = `device-card${reordering ? ' reordering' : ''}${tile?.level === 'err' ? ' has-error' : ''}${hidden ? ' hidden-tile' : ''}${moving === item.id ? ' moving' : ''}`;
          const editButton = (
            <button type="button" className="device-edit"
              title={item.kind === 'device' ? 'Edytuj dane sterownika' : 'Zmień kafelek pogody'}
              aria-label={`${item.kind === 'device' ? 'Edytuj dane sterownika' : 'Zmień kafelek pogody'} ${label}`}
              onClick={() => item.kind === 'device' ? setEditing(item.device) : setEditingWeather(item.weather)}>
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M4 20H8L18.5 9.5C19.3 8.7 19.3 7.3 18.5 6.5L17.5 5.5C16.7 4.7 15.3 4.7 14.5 5.5L4 16V20Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                <path d="M13 7L17 11" stroke="currentColor" strokeWidth="2" />
              </svg>
            </button>
          );
          return (
            <div key={item.id} className={classes} style={position}>
              {item.kind === 'device' ? (
                <button type="button" className="device-choose" disabled={reordering} onClick={() => chooseDevice(item.device)}
                  title={sharedInfo(item.device)}>
                  <TemplateTile template={template} deviceType={item.device.deviceType} name={label} tile={tile} now={now} loading={!tilesLoaded} />
                </button>
              ) : (
                <div className="device-choose device-choose-static" title={item.weather.home
                  ? 'Dom: temperatura z czujnika kotła, gdy jest świeża, inaczej prognoza Open-Meteo.'
                  : `${item.weather.lat.toFixed(4)} N, ${item.weather.lon.toFixed(4)} E · prognoza Open-Meteo`}>
                  <TemplateTile template={template} now={now} level="sky" slots={weatherSlots(item.weather, now, outdoor)} />
                </div>
              )}
              {reordering ? (
                <>
                  {/* kafelek, do którego ma trafić przenoszony: zamiana miejsc */}
                  {moving && moving !== item.id && (
                    <button type="button" className="device-cell-swap" onClick={() => placeAt(slot)}>Zamień miejscami</button>
                  )}
                  <div className="device-reorder-arrows">
                    <button type="button" className={`device-move${moving === item.id ? ' active' : ''}`}
                      title={moving === item.id ? 'Anuluj przenoszenie' : 'Przenieś'} aria-pressed={moving === item.id}
                      aria-label={`Przenieś ${label}`} onClick={() => setMoving(moving === item.id ? null : item.id)}>
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path d="M5 9h14M15 5l4 4-4 4M19 15H5M9 11l-4 4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <span className="device-reorder-middle">
                      <button type="button" className={`device-eye${hidden ? ' hidden' : ''}`} title={hidden ? 'Pokaż kafelek' : 'Ukryj kafelek'}
                        aria-label={`${hidden ? 'Pokaż' : 'Ukryj'} kafelek ${label}`} aria-pressed={hidden} onClick={() => toggleHidden(item)}>
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                          <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
                          {hidden && <path d="M4 4L20 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
                        </svg>
                      </button>
                      {editButton}
                    </span>
                  </div>
                </>
              ) : (
                <div className="device-tools">
                  {isSystem && item.kind === 'device' && getDeviceTypeView(item.device.deviceType).firmwareUpdates && (
                    <button
                      type="button"
                      className="device-firmware"
                      title="Firmware tego rodzaju sterownika"
                      aria-label={`Firmware rodzaju sterownika ${label}`}
                      onClick={() => navigate(`/firmware/${encodeURIComponent(item.device.deviceType)}`)}
                    >
                      <SettingsIcon />
                    </button>
                  )}
                  {(item.kind === 'weather' || item.device.access !== 'shared') && editButton}
                </div>
              )}
            </div>
          );
        };
        return (
          <>
            <section className={`device-list device-grid${reordering ? ' editing' : ''}`} ref={listRef} style={gridStyle}>
              {topCells.map((slot) => renderCell(slot, 0))}
              {!devicesLoaded && devices.length === 0 && !error && Array.from({ length: rememberedDeviceCount() }, (_, index) => (
          <div key={`skeleton-${index}`} className="device-card">
            <div className="device-choose" aria-hidden="true">
              <TemplateTile template={template} now={now} loading />
            </div>
          </div>
        ))}
              {devicesLoaded && devices.length === 0 && !error && (
                <p>Brak sterowników. Sterownik pojawi się tutaj, gdy ktoś Ci go udostępni albo po przypisaniu do konta.</p>
              )}
            </section>
            {bottomCells.length > 0 && (
              <>
                <div className="device-list-spacer" ref={spacerRef} style={{ height: spacer }} aria-hidden="true" />
                <section className="device-list device-grid device-grid-bottom" ref={bottomRef} style={gridStyle}>
                  {bottomCells.map((slot) => renderCell(slot, emptyRow + 1))}
                </section>
              </>
            )}
          </>
        );
      })()}
    </main>

    {/* poza <main>: tam obowiązuje skala 0,9, a okno i stopka mają mieć zwykły rozmiar */}
    {editing && <DeviceEditModal device={editing} onClose={() => setEditing(null)} onSaved={saved} />}
    {editingWeather !== undefined && (
      <WeatherTileModal tile={editingWeather} onClose={() => setEditingWeather(undefined)} onSaved={weatherSaved} onRemoved={weatherRemoved} />
    )}

      {/* zajętość bazy tylko dla użytkownika systemowego (konta użytkowników); bez niej stopki nie ma */}
      {isSystem && <footer className="device-footer devices-footer">
        {/* lewa część zarezerwowana na później (plan 2026-10-04) */}
        <span />
        <DatabaseUsage />
      </footer>}
    </>
  );
};
