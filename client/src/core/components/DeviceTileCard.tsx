// Kafelek na liście sterowników (/devices) w wyglądzie „Instrument” (2026-10-17): stały układ z makiety
// (makiety/src/makieta.html, ekran #s-lista; klasy .tile* z client/src/makieta.css). Rysuje treść kafelka
// (bez obramowania <article>, które daje pages/Devices): .tile-head (ikona rodzaju, nazwa, chip Online / Offline,
// narzędzia), .tile-main (.tile-value: duża liczba + jednostka + opis; .tile-side: stan pracy), .tile-facts (pola
// dt/dd), .warn-line (błąd albo ostrzeżenie), .relays (włącznik) i .tile-foot „dane sprzed …”.
// Dane z GET /api/devices/summary (DeviceTile): wartość główna, wartości boczne i wiersz wartości są tu rozkładane
// na pola makiety osobno dla każdego rodzaju (shapeTile). Kafelek pogody (WeatherTileCard) z GET /api/weather-tiles.
// Ikony rodzajów i narzędzi to ikony makiety (ListIcon, kreska 1.8), żeby animacje .is-running z makieta.css działały.
import { ReactNode } from 'react';
import { DeviceTile, DeviceType, OutdoorConditions, TileFact, WeatherTile } from '../types';
import { precipitationText, weatherDescription, WeatherIcon } from './WeatherIcon';

// „8 s”, „5 min”, „3 h”, „2 dni” — wiek danych w stopce kafelka (używane też w OfflineBanner)
export function ageLabel(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} dni`;
}

// ---- ikony makiety (jeden zestaw, kreska 1.8; makieta.html, ICONS) ----
const ICON_PATHS: Record<string, string> = {
  hp: 'M6 3c-2 3-2 5 0 8s2 5 0 8M12 3c-2 3-2 5 0 8s2 5 0 8M18 3c-2 3-2 5 0 8s2 5 0 8',
  pv: 'M4 10h16l2 9H2zM8 10l1-4h6l1 4M6 14.5h12M9 10v9M15 10v9',
  sun: 'M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  drop: 'M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z',
  fire: 'M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3 1-6 1-9z',
  edit: 'M4 20h4l10-10-4-4L4 16zM13 7l4 4',
  chip: 'M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4',
  move: 'M12 3v18M3 12h18M8 7l4-4 4 4M8 17l4 4 4-4M7 8l-4 4 4 4M17 8l4 4-4 4',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z',
  'eye-off': 'M3 3l18 18M10 6a10 10 0 0 1 12 6s-1 2-3 4M6 8c-2 2-4 4-4 4s4 7 10 7c2 0 3-.5 5-1',
  close: 'M6 6l12 12M18 6L6 18',
  grid: '',
  'switch': '',
};
export type ListIconName = keyof typeof ICON_PATHS;

// Ikona makiety jako SVG z klasą .ic (rozmiar i animacje z makieta.css).
export function ListIcon({ name }: { name: ListIconName }) {
  return (
    <svg className="ic" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {name === 'sun' && <circle cx="12" cy="12" r="4" />}
      {name === 'chip' && <rect x="6" y="6" width="12" height="12" rx="2" />}
      {name === 'eye' && <circle cx="12" cy="12" r="3" />}
      {name === 'switch' && <><rect x="2" y="7" width="20" height="10" rx="5" /><circle cx="16" cy="12" r="3" /></>}
      {name === 'grid' && <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>}
      {ICON_PATHS[name] && <path d={ICON_PATHS[name]} />}
    </svg>
  );
}

// rodzaj sterownika → data-kind makiety (kolor ikony i krawędzi: .tile[data-kind] w makieta.css)
export type TileKind = 'hp' | 'pv' | 'tank' | 'switch' | 'boiler' | 'weather';
export const TILE_KINDS: Record<DeviceType, TileKind> = {
  [DeviceType.HP]: 'hp',
  [DeviceType.PHOTOVOLTAIC]: 'pv',
  [DeviceType.WATER_PRESSURE_TANK]: 'tank',
  [DeviceType.SWITCH]: 'switch',
  [DeviceType.PELLET_BOILER_PELUX200]: 'boiler',
};
const KIND_ICONS: Record<TileKind, ListIconName> = { hp: 'hp', pv: 'pv', tank: 'drop', switch: 'switch', boiler: 'fire', weather: 'sun' };

// Kolor chipu: „Online” zielony, „Offline” według poziomu kafelka (szary, gdy brak danych jest normalny: poziom ok
// albo hydrofor, którego sterownik ma zasilanie tylko przy pracy pompy); inne napisy („Brak danych”) według poziomu.
function chipClass(tile: DeviceTile, deviceType: DeviceType): string {
  if (tile.chip === 'Online') return 'ok';
  if (tile.chip === 'Offline' && (tile.level === 'ok' || deviceType === DeviceType.WATER_PRESSURE_TANK)) return 'off';
  return tile.level === 'ok' ? 'off' : tile.level;
}

// „42,5 °C” → duża liczba „42,5” i jednostka „°C”; wartość bez jednostki (np. „---”, „0 / 10”) zostaje w całości
function splitValue(value: string): { big: string; unit?: string } {
  const match = /^(.*\d)\s+([^\d\s]+)$/.exec(value.trim());
  return match ? { big: match[1], unit: match[2] } : { big: value };
}

// podpis pola, gdy serwer nie podał etykiety (np. tryb pracy pompy ma pustą etykietę)
const ICON_LABELS: Partial<Record<TileFact['icon'], string>> = {
  sliders: 'Tryb', bolt: 'Moc', thermo: 'Temp.', pellet: 'Pellet', tap: 'CWU', battery: 'Dziś', panel: 'Panele',
  timer: 'Pompa', repeat: 'Uruchomień', bubbles: 'Kompresor', target: 'Cel', drop: 'Woda', sun: 'Moc',
};
type Fact = { dt: string; dd: string };
const fact = (item: TileFact, dt?: string): Fact => ({ dt: dt ?? (item.label || ICON_LABELS[item.icon] || ''), dd: item.value });

type Shape = {
  big?: string;
  unit?: string;
  label?: string;
  /** stan pracy w .tile-side (sprężarka, palenie, pompa hydroforu) */
  state?: { text: string; title: string };
  facts: Fact[];
  foot?: string;
};

// Rozkład danych kafelka (DeviceTile) na pola makiety: wartość główna z opisem, stan pracy po prawej, pola dt/dd.
// Każdy rodzaj inaczej składa opis pod dużą liczbą (jak w makiecie: „zbiornik · cel 38–45”, „dziś · 7 507 l
// w miesiącu”, „moc teraz · 4 panele”, „kocioł · zadana 67”).
function shapeTile(kind: TileKind, tile: DeviceTile): Shape {
  const side = tile.side ?? [];
  const row = tile.row ?? [];
  const shape: Shape = { facts: [] };
  if (tile.main) Object.assign(shape, splitValue(tile.main.value));
  const label = tile.main?.label ?? '';
  switch (kind) {
    case 'hp': {
      const target = side.find((item) => item.icon === 'target');
      shape.label = target ? `${label} · cel ${target.value}` : label;
      shape.facts = [...row.map((item) => fact(item)), ...side.filter((item) => item !== target).map((item) => fact(item))];
      if (tile.running) shape.state = { text: 'pracuje', title: 'Sprężarka pracuje' };
      break;
    }
    case 'pv': {
      const panels = side.find((item) => item.icon === 'panel');
      shape.label = `${label === 'teraz' ? 'moc teraz' : label}${panels ? ` · ${panels.value} ${panels.label ?? 'paneli'}` : ''}`;
      shape.facts = [...side.filter((item) => item !== panels).map((item) => fact(item)), ...row.map((item) => fact(item, item.icon === 'thermo' ? 'Falownik' : undefined))];
      break;
    }
    case 'tank': {
      shape.label = tile.main2 ? `${label} · ${tile.main2.value} w miesiącu` : label;
      shape.facts = row.map((item) => fact(item));
      // stopka rodzaju: „ostatnie uruchomienie 13.10 19:07” → pole Ostatnie; „pompa pracuje 4 min” → stan pracy
      const foot = tile.foot ?? '';
      if (foot.startsWith('ostatnie uruchomienie ')) shape.facts.push({ dt: 'Ostatnie', dd: foot.slice('ostatnie uruchomienie '.length) });
      else if (foot.startsWith('pompa pracuje ')) shape.state = { text: foot.slice('pompa pracuje '.length), title: `Pompa pracuje od ${foot.slice('pompa pracuje '.length)}` };
      else if (foot) shape.foot = foot;
      break;
    }
    case 'boiler': {
      shape.label = label.replace(' → ', ' · zadana ');
      shape.facts = [...side.map((item) => fact(item)), ...row.map((item) => fact(item))];
      if (tile.running) shape.state = { text: 'pali', title: 'Kocioł pali' };
      break;
    }
    default:
      shape.label = label;
      shape.facts = [...side.map((item) => fact(item)), ...row.map((item) => fact(item))];
  }
  if (kind !== 'tank' && tile.foot) shape.foot = tile.foot;
  return shape;
}

// Pasek błędu albo ostrzeżenia (.warn-line z makiety; błąd w kolorach błędu, Devices/style.css)
const WarnLine = ({ note }: { note: NonNullable<DeviceTile['note']> }) => (
  <div className="tile-row"><span className={`warn-line${note.level === 'err' ? ' is-err' : ''}`}>{note.text}</span></div>
);

const Facts = ({ facts }: { facts: Fact[] }) => (
  <dl className="tile-facts">
    {facts.map((item, index) => <div key={index}><dt>{item.dt}</dt><dd title={item.dd}>{item.dd}</dd></div>)}
  </dl>
);

// Duszek: szare, pulsujące bloki w miejscu wartości (kafelek ma wysokość zwykłego kafelka, więc nic nie skacze).
function Skeleton() {
  return (
    <>
      <span className="skeleton skeleton-main" />
      <span className="skeleton skeleton-row" />
      <span className="skeleton skeleton-foot" />
    </>
  );
}

// stopka „kafelek ukryty …” zamiast wieku danych (tylko w trybie „Zmień układ”, gdzie ukryte kafelki widać)
const HIDDEN_FOOT = 'kafelek ukryty · widoczny tylko w trybie „Zmień układ”';

export function DeviceTileCard({ deviceType, name, tile, now, loading, hidden, tools }: {
  deviceType: DeviceType; name: string; tile?: DeviceTile; now: number;
  /** dane kafelka jeszcze się ładują: zamiast wartości duszek */
  loading?: boolean;
  /** kafelek ukryty (chip „Ukryty”, stopka o ukryciu) */
  hidden?: boolean;
  /** ołówek i trybik firmware w nagłówku (.tile-tools) */
  tools?: ReactNode;
}) {
  const kind = TILE_KINDS[deviceType] ?? 'hp';
  const head = (
    <div className="tile-head">
      <span className="tile-icon"><ListIcon name={KIND_ICONS[kind]} /></span>
      <h2 className="tile-name">{name}</h2>
      {hidden ? <span className="chip chip-off">Ukryty</span> : tile && (
        <span className={`chip chip-${chipClass(tile, deviceType)}${tile.running ? ' is-running' : ''}`}
          title={tile.running ? 'Pracuje' : undefined}>
          {(tile.chip === 'Online' || tile.running) && <i className="dot" />}{tile.chip}
        </span>
      )}
      {tools && <span className="tile-tools">{tools}</span>}
    </div>
  );
  if (loading && !tile) return <>{head}<Skeleton /></>;
  if (!tile) return <>{head}{hidden && <footer className="tile-foot">{HIDDEN_FOOT}</footer>}</>;

  const shape = shapeTile(kind, tile);
  const age = tile.updatedAt ? `dane sprzed ${ageLabel(now - new Date(tile.updatedAt).getTime())}` : '';
  const foot = hidden ? HIDDEN_FOOT : [shape.foot, age].filter(Boolean).join(' · ');
  return (
    <>
      {head}
      {tile.relays?.length ? (
        <div className="relays">
          {tile.relays.map((relay) => (
            <div key={relay.name} className="relay">
              <span className="relay-name">{relay.name}</span>
              {/* tryb „Wyłączony” blokuje harmonogram: opis na czerwono jak w makiecie */}
              <span className={`relay-desc${relay.text.startsWith('wyłączony ręcznie') ? ' danger-text' : ''}`}>{relay.text}</span>
              <span className={`switch${relay.on ? ' is-on' : ''}`} role="switch" aria-checked={relay.on} aria-label={relay.name} />
            </div>
          ))}
        </div>
      ) : null}
      {shape.big !== undefined && (
        <div className="tile-main">
          <div className="tile-value">
            <span className="big">{shape.big}</span>
            {shape.unit && <span className="unit">{shape.unit}</span>}
            {shape.label && <span className="big-label">{shape.label}</span>}
          </div>
          {shape.state && (
            <div className="tile-side">
              <span className="state state-on" title={shape.state.title}><i className="dot" />{shape.state.text}</span>
            </div>
          )}
        </div>
      )}
      {shape.facts.length > 0 && <Facts facts={shape.facts} />}
      {tile.note && <WarnLine note={tile.note} />}
      {foot && <footer className="tile-foot">{foot}</footer>}
    </>
  );
}

const number1 = (value: number) => value.toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const number01 = (value: number) => value.toLocaleString('pl-PL', { maximumFractionDigits: 1 });

// Kafelek pogody: ikona nieba, nazwa, temperatura z opisem nieba, pola Wiatr / Chmury / Opad i stopka
// „Open-Meteo · X min temu”. Dom: temperatura z czujnika kotła, gdy jest świeża (outdoor z GET /temperature).
export function WeatherTileCard({ tile, now, outdoor, hidden, tools }: {
  tile: WeatherTile; now: number; outdoor?: OutdoorConditions | null; hidden?: boolean; tools?: ReactNode;
}) {
  const weather = tile.weather;
  const boiler = tile.home && outdoor?.temperatureSource === 'boiler' && typeof outdoor.temperature === 'number';
  const temperature = boiler ? outdoor!.temperature! : weather?.temperature;
  const facts: Fact[] = weather ? [
    { dt: 'Wiatr', dd: `${Math.round(weather.windSpeed)} km/h` },
    { dt: 'Chmury', dd: `${Math.round(weather.cloudCover)} %` },
    { dt: 'Opad', dd: weather.snowfall > 0 ? `${number01(weather.snowfall)} cm` : `${number01(weather.precipitation)} mm` },
  ] : [];
  const foot = hidden ? HIDDEN_FOOT : weather
    ? `${boiler ? 'czujnik kotła · ' : ''}Open-Meteo · ${ageLabel(now - new Date(weather.at).getTime())} temu`
    : tile.home ? 'włącznik nie zgłosił pogody od 45 min' : 'czeka na włącznik (firmware od 1.2.0)';
  return (
    <>
      <div className="tile-head">
        <span className="tile-icon">{weather ? <WeatherIcon weather={weather} /> : <ListIcon name="sun" />}</span>
        <h2 className="tile-name">{tile.name}</h2>
        {hidden && <span className="chip chip-off">Ukryty</span>}
        {tools && <span className="tile-tools">{tools}</span>}
      </div>
      <div className="tile-main">
        <div className="tile-value" title={weather ? precipitationText(weather) : undefined}>
          <span className="big">{typeof temperature === 'number' ? number1(temperature) : '---'}</span>
          <span className="unit">°C</span>
          <span className="big-label">{weather ? weatherDescription(weather.code) : boiler ? 'czujnik kotła' : 'brak pogody z włącznika'}</span>
        </div>
      </div>
      {facts.length > 0 && <Facts facts={facts} />}
      <footer className="tile-foot">{foot}</footer>
    </>
  );
}
