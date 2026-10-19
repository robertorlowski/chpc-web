// Pasek i zakładki strony pogody (/weather/:id), od 2026-10-19 jak widoki sterownika (makieta #s-pogoda-*,
// data-device="pogoda"): strzałka do listy, tytuł „Pogoda · <miejsce>” (nazwę wstawia pages/Weather przez
// WEATHER_TITLE_ID), opis źródła, zakładki w bocznym menu (komputer) albo w dolnej nawigacji z „Więcej” (telefon).
// Wcześniej zakładki były segmentami nad treścią strony. Wybrana zakładka jest w ?tab= (Teraz = bez parametru);
// stan nawigacji (kafelek z listy) przechodzi między zakładkami, a zmiana zakładki nie dodaje wpisu w historii.
// Montowane w core/App.tsx.
import { ReactNode } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { BottomNavItems, NavItem, SideTabs } from '../../components/Header';
import { BackIcon } from '../../components/icons';
import { UserMenu } from '../../components/UserMenu';

export const WEATHER_TITLE_ID = 'weather-title-place';

// ikony jak w makiecie (kreska, siatka 24); fill="none" jawnie, bo CSS menu ustawia fill
const icon = (path: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
    strokeLinejoin="round" aria-hidden="true">{path}</svg>
);

export const WEATHER_TABS = [
  { key: 'now', label: 'Teraz', icon: icon(<path fill="none" d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z" />) },
  { key: 'days', label: 'Najbliższe dni', icon: icon(<><rect fill="none" x="3" y="5" width="18" height="16" rx="2" /><path fill="none" d="M3 10h18M8 3v4M16 3v4" /></>) },
  { key: 'pv', label: 'Słońce i PV', icon: icon(<><circle fill="none" cx="12" cy="12" r="4" /><path fill="none" d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>) },
  { key: 'heating', label: 'Ogrzewanie', icon: icon(<><path fill="none" d="M3 11l9-7 9 7v9H3z" /><path fill="none" d="M10 20v-5h4v5" /></>) },
  { key: 'air', label: 'Powietrze', icon: icon(<path fill="none" d="M5 19c0-8 6-14 15-14 0 9-6 15-14 15M5 19l7-7" />) },
  { key: 'wind', label: 'Wiatr i opady', icon: icon(<path fill="none" d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8" />) },
] as const;
export type WeatherTabKey = (typeof WEATHER_TABS)[number]['key'];

export const weatherTab = (value: string | null): WeatherTabKey =>
  WEATHER_TABS.find((item) => item.key === value)?.key ?? 'now';

function useWeatherItems(): NavItem[] {
  const location = useLocation();
  const [search] = useSearchParams();
  const tab = weatherTab(search.get('tab'));
  return WEATHER_TABS.map((item) => ({
    key: item.key,
    to: { pathname: location.pathname, search: item.key === 'now' ? '' : `?tab=${item.key}` },
    label: item.label,
    icon: item.icon,
    active: tab === item.key,
    state: location.state,
    replace: true,
  }));
}

export function WeatherHeader() {
  const items = useWeatherItems();
  return (
    <>
      <Link to="/devices" className="nav-back" title="Lista sterowników" aria-label="Wróć do listy sterowników"><BackIcon /></Link>
      <div className="device-title">
        <h1>Pogoda<span id={WEATHER_TITLE_ID} /></h1>
        <span className="device-sub"><span className="device-sub-text">Open‑Meteo · prognoza i jakość powietrza</span></span>
      </div>
      <SideTabs items={items} label="Widoki pogody" />
      <UserMenu />
    </>
  );
}

export function WeatherBottomNav() {
  return <BottomNavItems items={useWeatherItems()} label="Widoki pogody (telefon)" />;
}
