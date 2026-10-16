// Pogoda nad kafelkami listy urządzeń: opis i ikona z kodu pogody WMO z Open-Meteo (pobiera sterownik włącznika,
// serwer oddaje w GET /temperature, core/services/meteo.service.ts). W nocy (isDay = false) zamiast słońca księżyc.
import type { Weather } from '../types';

type Kind = 'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm';

const DESCRIPTIONS: Record<number, string> = {
  0: 'bezchmurnie', 1: 'przeważnie bezchmurnie', 2: 'małe zachmurzenie', 3: 'pochmurno',
  45: 'mgła', 48: 'mgła (szadź)',
  51: 'słaba mżawka', 53: 'mżawka', 55: 'gęsta mżawka', 56: 'marznąca mżawka', 57: 'marznąca mżawka',
  61: 'słaby deszcz', 63: 'deszcz', 65: 'silny deszcz', 66: 'marznący deszcz', 67: 'marznący deszcz',
  71: 'słaby śnieg', 73: 'śnieg', 75: 'intensywny śnieg', 77: 'ziarna śniegu',
  80: 'przelotny deszcz', 81: 'przelotny deszcz', 82: 'ulewa',
  85: 'przelotny śnieg', 86: 'przelotny śnieg',
  95: 'burza', 96: 'burza z gradem', 99: 'burza z gradem',
};

export const weatherDescription = (code: number) => DESCRIPTIONS[code] ?? 'pogoda nieznana';

const kindOf = (code: number): Kind => {
  if (code === 0) return 'clear';
  if (code <= 2) return 'partly';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  return 'cloudy';
};

// Opad dla widoku szerokiego: śnieg w cm, inny opad w mm z ostatniego kwadransa, inaczej „bez opadów”.
export const precipitationText = (weather: Weather) => {
  const number = (value: number) => value.toLocaleString('pl-PL', { maximumFractionDigits: 1 });
  if (weather.snowfall > 0) return `śnieg ${number(weather.snowfall)} cm`;
  if (weather.precipitation > 0) return `opad ${number(weather.precipitation)} mm`;
  return 'bez opadów';
};

const SUN = '#f2a900';
const MOON = '#3f51b5';
const CLOUD = '#78909c';
const CLOUD_LIGHT = '#b0bec5';
const WATER = '#1e88e5';

const sunOrMoon = (day: boolean, small: boolean) => day
  ? small
    ? <><circle cx="8.5" cy="8.5" r="3.6" fill={SUN} /><path d="M8.5 1.5v2M1.5 8.5h2M3.6 3.6l1.4 1.4M13.4 3.6L12 5" stroke={SUN} strokeWidth="2" strokeLinecap="round" /></>
    : <><circle cx="12" cy="12" r="4.5" fill={SUN} /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" stroke={SUN} strokeWidth="2" strokeLinecap="round" /></>
  : small
    ? <path d="M13 9.5A5 5 0 0 1 7 3.6a5 5 0 1 0 6 5.9z" fill={MOON} />
    : <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" fill={MOON} />;

const upperCloud = (color: string) => <path d="M7 14h10a4 4 0 0 0 .5-7.97A5.6 5.6 0 0 0 6.6 7 3.5 3.5 0 0 0 7 14z" fill={color} />;

export const WeatherIcon: React.FC<{ weather: Weather }> = ({ weather }) => {
  const kind = kindOf(weather.code);
  return (
    <svg className="weather-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      {kind === 'clear' && sunOrMoon(weather.isDay, false)}
      {kind === 'partly' && <>{sunOrMoon(weather.isDay, true)}<path d="M9 20h9a4 4 0 0 0 .5-7.97A5.3 5.3 0 0 0 8.4 13 3.5 3.5 0 0 0 9 20z" fill={CLOUD_LIGHT} /></>}
      {kind === 'cloudy' && <path d="M7 19h10a4.5 4.5 0 0 0 .6-8.96A6 6 0 0 0 6.2 11.1 4 4 0 0 0 7 19z" fill={CLOUD} />}
      {kind === 'fog' && <path d="M4 9h16M6 13h12M4 17h16" stroke={CLOUD_LIGHT} strokeWidth="2" strokeLinecap="round" />}
      {kind === 'drizzle' && <>{upperCloud(CLOUD_LIGHT)}<path d="M9 17v1.5M13 17v1.5M11 20v1.5M15 20v1.5" stroke={WATER} strokeWidth="2" strokeLinecap="round" /></>}
      {kind === 'rain' && <>{upperCloud(CLOUD)}<path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3" stroke={WATER} strokeWidth="2" strokeLinecap="round" /></>}
      {kind === 'snow' && <>{upperCloud(CLOUD_LIGHT)}<circle cx="8" cy="18" r="1.3" fill={WATER} /><circle cx="12" cy="20" r="1.3" fill={WATER} /><circle cx="16" cy="18" r="1.3" fill={WATER} /></>}
      {kind === 'storm' && <><path d="M7 13h10a4 4 0 0 0 .5-7.97A5.6 5.6 0 0 0 6.6 6 3.5 3.5 0 0 0 7 13z" fill={CLOUD} /><path d="M12 13l-3 5h3l-1 4 4-6h-3l1-3z" fill={SUN} /></>}
    </svg>
  );
};
