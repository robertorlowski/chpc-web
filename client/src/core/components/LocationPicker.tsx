// Lokalizacja konta na mapie OpenStreetMap (Leaflet, bez klucza API): kliknięcie stawia punkt, przycisk
// „Moja lokalizacja” bierze pozycję z przeglądarki (wymaga HTTPS i zgody). Punkt jako kółko, bez obrazków ikon.
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useLang } from '../i18n';
import { UserLocation } from '../types';

// środek Polski, gdy lokalizacji jeszcze nie ma
const POLAND: L.LatLngExpression = [52.07, 19.48];

const format = (value: number, locale: string) => value.toLocaleString(locale, { minimumFractionDigits: 4, maximumFractionDigits: 4 });

export function LocationPicker({ value, onChange }: { value: UserLocation | null; onChange: (location: UserLocation) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.CircleMarker | null>(null);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const [error, setError] = useState('');
  const { t, locale } = useLang();

  useEffect(() => {
    if (!box.current) return;
    const instance = L.map(box.current, { attributionControl: true }).setView(value ? [value.lat, value.lng] : POLAND, value ? 13 : 5);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(instance);
    instance.on('click', (event: L.LeafletMouseEvent) => changeRef.current({ lat: event.latlng.lat, lng: event.latlng.lng }));
    map.current = instance;
    return () => {
      instance.remove();
      map.current = null;
      marker.current = null;
    };
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    if (!value) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    const point: L.LatLngExpression = [value.lat, value.lng];
    if (marker.current) marker.current.setLatLng(point);
    else marker.current = L.circleMarker(point, { radius: 9, color: '#ffffff', weight: 3, fillColor: '#c0392b', fillOpacity: 1 }).addTo(instance);
  }, [value?.lat, value?.lng]);

  const locate = () => {
    setError('');
    if (!navigator.geolocation) return setError(t('location.unsupported'));
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = { lat: position.coords.latitude, lng: position.coords.longitude };
        changeRef.current(location);
        map.current?.setView([location.lat, location.lng], 15);
      },
      () => setError(t('location.failed')),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  return (
    <div className="location-picker">
      <div ref={box} className="location-map" role="application" aria-label={t('location.mapLabel')} />
      <div className="location-row">
        <span>{value ? `${format(value.lat, locale)}; ${format(value.lng, locale)}` : t('location.none')}</span>
        <button type="button" className="location-locate" onClick={locate}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          </svg>
          {t('location.mine')}
        </button>
      </div>
      {error && <p className="account-error">{error}</p>}
    </div>
  );
}
