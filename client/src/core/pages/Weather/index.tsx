// Strona pogody (/weather/:id), otwierana kliknięciem kafelka pogody na liście sterowników (pages/Devices).
// Kafelek pokazuje bieżące warunki pobrane przez włącznik (GET /weather-tiles); prognozę i jakość powietrza ta strona
// pobiera przeglądarką wprost z Open-Meteo (forecast.ts). Kafelek „Moja lokalizacja” (current) bierze położenie
// z przeglądarki (core/currentPlace.ts). Zakładki (makieta #pogoda-*), wybrana w ?tab=:
// „Teraz” (NowTab), „Najbliższe dni” (DaysTab), „Słońce i PV” (SunTab, prognoza produkcji dopasowana do DTU),
// „Ogrzewanie” (HeatingTab, okno CWU w G12w), „Powietrze” (AirTab), „Wiatr i opady” (WindTab).
// Nazwa miejsca trafia do paska aplikacji (WEATHER_TITLE_ID w core/App.tsx).
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useParams, useSearchParams } from 'react-router-dom';
import { DeviceRequests, WeatherTileRequests } from '../../api';
import { currentPlaceProblem, useCurrentPlace } from '../../currentPlace';
import { WeatherTile } from '../../types';
import { AirTab } from './AirTab';
import { DaysTab } from './DaysTab';
import { fetchForecast, Forecast } from './forecast';
import { HeatingTab } from './HeatingTab';
import { NowTab } from './NowTab';
import { PvLink, SunTab } from './SunTab';
import { WindTab } from './WindTab';
import './style.css';

export const WEATHER_TITLE_ID = 'weather-title-place';
const REFRESH_MS = 15 * 60 * 1000;

const TABS = [
  { key: 'now', label: 'Teraz' }, { key: 'days', label: 'Najbliższe dni' }, { key: 'pv', label: 'Słońce i PV' },
  { key: 'heating', label: 'Ogrzewanie' }, { key: 'air', label: 'Powietrze' }, { key: 'wind', label: 'Wiatr i opady' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export default function Weather() {
  const { id } = useParams();
  const location = useLocation();
  const [search, setSearch] = useSearchParams();
  const tab: TabKey = TABS.find((item) => item.key === search.get('tab'))?.key ?? 'now';
  // kafelek z listy (stan nawigacji) od razu, inaczej z GET /weather-tiles (wejście z adresu)
  const [tile, setTile] = useState<WeatherTile | null | undefined>((location.state as { tile?: WeatherTile } | null)?.tile);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [error, setError] = useState('');
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [pv, setPv] = useState<PvLink | null | undefined>(undefined);
  const [titleSlot, setTitleSlot] = useState<HTMLElement | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const here = useCurrentPlace(!!tile?.current);
  useEffect(() => setTitleSlot(document.getElementById(WEATHER_TITLE_ID)), []);

  useEffect(() => {
    if (tile && tile.id === id) return;
    WeatherTileRequests.list().then((list) => setTile(list?.find((item) => item.id === id) ?? null));
  }, [id]);

  // fotowoltaika konta (własna przed udostępnioną) do prognozy produkcji w „Słońce i PV”
  useEffect(() => {
    DeviceRequests.getDevices().then((list) => {
      const pvs = (list ?? []).filter((device) => device.deviceType === 'photovoltaic');
      const found = pvs.find((device) => device.access !== 'shared') ?? pvs[0];
      setPv(found ? { rootId: found.rootId, deviceId: found.deviceId } : null);
    });
  }, []);

  // położenie: stałe z kafelka albo bieżące z przeglądarki (zaokrąglone, żeby drobne zmiany nie pobierały od nowa)
  const coords = tile?.current
    ? here.place ? { lat: here.place.lat, lon: here.place.lon } : null
    : tile && tile.lat !== null && tile.lon !== null ? { lat: tile.lat, lon: tile.lon } : null;
  const lat = coords ? Math.round(coords.lat * 100) / 100 : null;
  const lon = coords ? Math.round(coords.lon * 100) / 100 : null;
  const name = tile?.current ? here.place?.name ?? tile.name : tile?.name ?? '';

  useEffect(() => {
    if (lat === null || lon === null) return undefined;
    let cancelled = false;
    const load = async () => {
      try {
        const data = await fetchForecast(lat, lon);
        if (!cancelled) { setForecast(data); setError(''); setLoadedAt(new Date()); }
      } catch {
        if (!cancelled) setError('Nie udało się pobrać prognozy z Open-Meteo.');
      }
    };
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [lat, lon]);

  // wybrana zakładka widoczna w pasku (na telefonie pasek przewija się w bok)
  useEffect(() => {
    const checked = tabsRef.current?.querySelector('input:checked')?.parentElement;
    if (checked && tabsRef.current) tabsRef.current.scrollLeft = checked.offsetLeft - 12;
  }, [tab]);

  const footer = useMemo(() => loadedAt
    ? `Open-Meteo · pobrana ${loadedAt.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' })}`
      + (tile?.current ? ' · Twoja lokalizacja' : '')
    : '', [loadedAt, tile?.current]);

  if (tile === null) return <div className="page page-narrow weather-page"><p className="empty">Nie ma takiego kafelka pogody.</p></div>;
  const locationProblem = tile?.current && !here.place ? currentPlaceProblem(here.status) : null;

  return (
    <div className="page page-narrow weather-page">
      {titleSlot && name && createPortal(` · ${name}`, titleSlot)}
      <div className="segmented seg-inline wx-tabs" role="radiogroup" aria-label="Widok pogody" ref={tabsRef}>
        {TABS.map((item) => (
          <label key={item.key} className="seg">
            <input type="radio" name="weather-tab" checked={tab === item.key}
              onChange={() => setSearch(item.key === 'now' ? {} : { tab: item.key }, { replace: true, state: location.state })} />
            <span>{item.label}</span>
          </label>
        ))}
      </div>
      {locationProblem && <div className="alert alert-warn"><div><strong>{locationProblem}</strong></div></div>}
      {error && !forecast && <div className="alert alert-err"><div><strong>{error}</strong></div></div>}
      {!forecast && !error && !locationProblem && <p className="app-loading">{tile?.current && !here.place ? 'Ustalam położenie…' : 'Pobieram prognozę…'}</p>}
      {forecast && lat !== null && lon !== null && (
        tab === 'now' ? <NowTab forecast={forecast} name={name} />
          : tab === 'days' ? <DaysTab forecast={forecast} />
            : tab === 'pv' ? (pv === undefined ? <p className="app-loading">Pobieram produkcję z DTU…</p> : <SunTab forecast={forecast} pv={pv} />)
              : tab === 'heating' ? <HeatingTab forecast={forecast} />
                : tab === 'air' ? <AirTab lat={lat} lon={lon} />
                  : <WindTab forecast={forecast} />
      )}
      {footer && <p className="wx-foot">{footer}{error ? ' · ostatnie odświeżenie nieudane' : ''}</p>}
    </div>
  );
}
