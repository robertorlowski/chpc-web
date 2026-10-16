// Popup „Kafelek pogody” (lista sterowników): dodanie i zmiana kafelka pogody (POST/PUT /api/weather-tiles),
// usunięcie (DELETE; kafelka „Dom” nie da się usunąć, bo daje temperaturę domu). Miejscowość szuka się w geokoderze
// Open-Meteo z przeglądarki (bez limitu na adres serwera); współrzędne można też wpisać ręcznie.
// Zamykany przyciskiem Anuluj, klawiszem Esc albo kliknięciem w tło.
import { FormEvent, useEffect, useRef, useState } from 'react';
import { WeatherTileRequests } from '../api';
import { WeatherTile } from '../types';
import './deviceEditModal.css';

type Props = {
  /** null = nowy kafelek */
  tile: WeatherTile | null;
  onClose: () => void;
  onSaved: (tile: WeatherTile) => void;
  onRemoved: (id: string) => void;
};

type Hit = { name: string; admin1?: string; country?: string; latitude: number; longitude: number };

const GEOCODER = 'https://geocoding-api.open-meteo.com/v1/search';
const number1 = (value: number) => value.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const parseCoordinate = (text: string) => Number(text.replace(',', '.').trim());

export function WeatherTileModal({ tile, onClose, onSaved, onRemoved }: Props) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [name, setName] = useState(tile?.name ?? '');
  const [lat, setLat] = useState(tile ? String(tile.lat) : '');
  const [lon, setLon] = useState(tile ? String(tile.lon) : '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const searchTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  // szukanie po 400 ms od ostatniej litery (od 2 znaków), najwyżej 6 podpowiedzi po polsku
  useEffect(() => {
    window.clearTimeout(searchTimer.current);
    const text = query.trim();
    if (text.length < 2) { setHits([]); return undefined; }
    searchTimer.current = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`${GEOCODER}?name=${encodeURIComponent(text)}&count=6&language=pl&format=json`);
        const body = await response.json() as { results?: Hit[] };
        setHits(body.results ?? []);
      } catch {
        setHits([]);
        setError('Wyszukiwarka miejscowości nie odpowiada. Wpisz współrzędne ręcznie.');
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => window.clearTimeout(searchTimer.current);
  }, [query]);

  const pick = (hit: Hit) => {
    setName(hit.name);
    setLat(String(hit.latitude));
    setLon(String(hit.longitude));
    setHits([]);
    setQuery('');
    setError('');
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const data = { name: name.trim(), lat: parseCoordinate(lat), lon: parseCoordinate(lon) };
    if (!data.name) { setError('Wpisz nazwę kafelka.'); return; }
    if (!Number.isFinite(data.lat) || !Number.isFinite(data.lon) || Math.abs(data.lat) > 90 || Math.abs(data.lon) > 180) {
      setError('Wpisz współrzędne: szerokość od -90 do 90, długość od -180 do 180.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      onSaved(tile ? await WeatherTileRequests.update(tile.id, data) : await WeatherTileRequests.create(data));
    } catch (caught) {
      setError((caught as { serverMessage?: string }).serverMessage ?? 'Nie udało się zapisać kafelka pogody.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!tile) return;
    setSaving(true);
    try {
      await WeatherTileRequests.remove(tile.id);
      onRemoved(tile.id);
    } catch {
      setError('Nie udało się usunąć kafelka pogody.');
      setSaving(false);
    }
  };

  return (
    <div className="device-modal-backdrop" onClick={onClose}>
      <form className="device-modal" role="dialog" aria-modal="true" aria-labelledby="weather-modal-title"
        onClick={(event) => event.stopPropagation()} onSubmit={save}>
        <h2 id="weather-modal-title">{tile ? 'Kafelek pogody' : 'Nowy kafelek pogody'}</h2>
        <label>
          <span>Szukaj miejscowości</span>
          <input id="weather-search" value={query} placeholder="np. Zakopane" autoFocus={!tile} autoComplete="off"
            onChange={(event) => setQuery(event.currentTarget.value)} />
        </label>
        {(hits.length > 0 || searching) && (
          <ul className="weather-hits" aria-label="Podpowiedzi">
            {searching && hits.length === 0 && <li className="weather-hit-note">Szukanie…</li>}
            {hits.map((hit, index) => (
              <li key={`${hit.latitude}-${hit.longitude}-${index}`}>
                <button type="button" onClick={() => pick(hit)}>
                  <span>{hit.name}{hit.admin1 ? `, ${hit.admin1}` : ''}{hit.country && hit.country !== 'Polska' ? `, ${hit.country}` : ''}</span>
                  <small>{number1(hit.latitude)} N · {number1(hit.longitude)} E</small>
                </button>
              </li>
            ))}
          </ul>
        )}
        <label>
          <span>Nazwa na kafelku</span>
          <input id="weather-name" value={name} maxLength={40} onChange={(event) => setName(event.currentTarget.value)} />
        </label>
        <div className="weather-coords">
          <label>
            <span>Szerokość geogr.</span>
            <input id="weather-lat" value={lat} inputMode="decimal" onChange={(event) => setLat(event.currentTarget.value)} />
          </label>
          <label>
            <span>Długość geogr.</span>
            <input id="weather-lon" value={lon} inputMode="decimal" onChange={(event) => setLon(event.currentTarget.value)} />
          </label>
        </div>
        <p className="weather-modal-note">
          {tile?.home
            ? 'Kafelek domu: temperatura z czujnika kotła, gdy jest świeża, inaczej z prognozy. Jego położenie daje też temperaturę na ekranach sterowników.'
            : 'Pogodę dla tego miejsca pobiera sterownik włącznika z Open-Meteo co 15 min (firmware od 1.2.0).'}
        </p>
        {error && <p className="device-modal-error">{error}</p>}
        {confirmRemove ? (
          <div className="device-modal-actions">
            <span className="weather-modal-note">Usunąć kafelek „{tile?.name}”?</span>
            <button type="button" className="device-modal-cancel" onClick={() => setConfirmRemove(false)} disabled={saving}>Nie</button>
            <button type="button" className="device-modal-danger" onClick={remove} disabled={saving}>Usuń</button>
          </div>
        ) : (
          <div className="device-modal-actions">
            {tile && !tile.home && (
              <button type="button" className="device-modal-danger device-modal-left" onClick={() => setConfirmRemove(true)} disabled={saving}>Usuń</button>
            )}
            <button type="button" className="device-modal-cancel" onClick={onClose} disabled={saving}>Anuluj</button>
            <button type="submit" disabled={saving}>{saving ? 'Zapisywanie…' : 'Zapisz'}</button>
          </div>
        )}
      </form>
    </div>
  );
}
