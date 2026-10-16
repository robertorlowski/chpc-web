// Kafelek sterownika na stronie /devices według wzoru (core/tile-template.ts): prostokąt z paskiem stanu po lewej,
// pola w miejscach ze wzoru. Treść jak w dawnym DeviceTileCard: ikona rodzaju (pulsuje przy pracy pompy i paleniu
// w piecu), nazwa, chip ze stanem, wartość główna (z drugą po „/”), wartości boczne, wiersz wartości, przekaźniki
// włącznika, błąd lub ostrzeżenie i stopka z wiekiem danych. Dane z GET /api/devices/summary (DeviceTile).
// Czcionki w jednostkach cqh kafelka (container-type: size), więc kafelek skaluje się z szerokością.
// Tryb design (projektant kafelka, pages/TileDesigner): puste pola z nazwą, zaznaczone pole z uchwytem rozmiaru,
// pola z błędem w czerwonej ramce.
import { CSSProperties, ReactNode } from 'react';
import { DeviceTile, DeviceType, OutdoorConditions, TileFact, WeatherTile } from '../types';
import { precipitationText, weatherDescription, WeatherIcon } from './WeatherIcon';
import { centerSingleSide, collapseEmpty, collapseFooterLine, widenMain, TILE_SLOT_KEYS, TILE_SLOTS, TileSlot, TileTemplate } from '../tile-template';
import { ageLabel } from './DeviceTileCard';
import { Pictogram } from './pictograms';
import './TemplateTile.css';

const TYPE_ICONS = {
  [DeviceType.HP]: 'heatpump',
  [DeviceType.WATER_PRESSURE_TANK]: 'drop',
  [DeviceType.PELLET_BOILER_PELUX200]: 'flame',
  [DeviceType.SWITCH]: 'power',
  [DeviceType.PHOTOVOLTAIC]: 'sun',
} as const;

// ikona rodzaju pulsuje przy pracy pompy ciepła i paleniu w piecu (decyzja użytkownika 2026-10-13)
const PULSE_TYPES = [DeviceType.HP, DeviceType.PELLET_BOILER_PELUX200];

// Kolor chipu: „Online” zielony (niebieski przy pracy), „Offline” według poziomu; hydrofor offline zawsze szary,
// bo jego sterownik ma zasilanie tylko przy pracy pompy.
function chipClass(tile: DeviceTile, deviceType: DeviceType): string {
  if (tile.running) return 'run';
  if (tile.chip === 'Online') return 'ok';
  if (tile.chip === 'Offline' && (tile.level === 'ok' || deviceType === DeviceType.WATER_PRESSURE_TANK)) return 'off';
  return tile.level;
}

const Fact = ({ fact }: { fact: TileFact }) => (
  <span className="tt-fact">
    <Pictogram name={fact.icon} />
    <b>{fact.value}</b>
    {fact.label ? <small>{fact.label}</small> : null}
  </span>
);

export type Slots = Partial<Record<TileSlot, ReactNode>> & { footInSide?: boolean; fullLabel?: boolean };

export function deviceSlots(deviceType: DeviceType, name: string, tile: DeviceTile | undefined, now: number): Slots {
  const pulse = !!tile?.running && PULSE_TYPES.includes(deviceType);
  const slots: Slots = {
    icon: <Pictogram name={TYPE_ICONS[deviceType] ?? 'waves'} className={pulse ? 'tt-pulse' : undefined} />,
    name: <span className="tt-ellipsis">{name}</span>,
  };
  if (!tile) return slots;
  slots.status = <span className={`tt-chip ${chipClass(tile, deviceType)}`}>{tile.chip}</span>;
  if (tile.main) {
    slots.main = (
      <>
        <Pictogram name={tile.main.icon} />
        {tile.main2 ? (
          // druga wartość (np. woda dziś / w miesiącu): podpis pod każdą liczbą, jak na produkcji
          <>
            <span className="tt-value"><b>{tile.main.value}</b>{tile.main.label && <small className="tt-under">{tile.main.label}</small>}</span>
            <span className="tt-sep">/</span>
            <span className="tt-value"><b>{tile.main2.value}</b>{tile.main2.label && <small className="tt-under">{tile.main2.label}</small>}</span>
          </>
        ) : <b>{tile.main.value}</b>}
      </>
    );
    // przy drugiej wartości podpisy wiszą pod liczbami, ale miejsce pola Opis wartości jest zajęte
    if (tile.main2) slots.mainLabel = '';
    else if (tile.main.label) slots.mainLabel = tile.main.label;
  }
  (tile.side ?? []).slice(0, 3).forEach((fact, index) => { slots[`side${index + 1}` as TileSlot] = <Fact fact={fact} />; });
  if (tile.row?.length) slots.row = <span className="tt-row">{tile.row.map((fact, index) => <Fact key={index} fact={fact} />)}</span>;
  if (tile.relays?.length) {
    slots.relays = (
      <span className="tt-relays">
        {tile.relays.map((relay) => (
          <span key={relay.name} className="tt-relay">
            <span className={`tt-dot${relay.on ? ' on' : ''}`} />
            <b>{relay.name}</b>
            <small>{relay.text}</small>
          </span>
        ))}
      </span>
    );
  }
  if (tile.note) {
    slots.warning = (
      <span className={`tt-note ${tile.note.level}`}>
        <Pictogram name={tile.note.level === 'err' ? 'error' : 'warn'} />
        <span>{tile.note.text}</span>
      </span>
    );
  }
  // własny tekst stopki rodzaju („ostatnie uruchomienie …”) idzie do wolnej prawej kolumny u góry (decyzja użytkownika
  // 2026-10-16), żeby stopka miała jeden wiersz i kafelek nie był wyższy od innych; bez wolnego miejsca zostaje w stopce
  let foot = tile.foot;
  if (foot && !slots.side1) {
    slots.side1 = <span className="tt-fact tt-foot-side"><small>{foot}</small></span>;
    slots.footInSide = true;
    foot = undefined;
  }
  const age = tile.updatedAt ? `dane sprzed ${ageLabel(now - new Date(tile.updatedAt).getTime())}` : '';
  const lines = [foot, age].filter((line): line is string => !!line);
  if (lines.length) slots.footer = lines.map((line) => <span key={line}>{line}</span>);
  return slots;
}

// Tekst stopki rodzaju w prawym górnym rogu: wąskie pole na dwa wiersze (od Wartości 1 do końca Wartości 2) z czcionką
// Wartości 1, a wartość główna dostaje miejsce aż do niego.
const FOOT_SIDE_WIDTH = 36;
function footSideShape(template: TileTemplate): TileTemplate {
  const { side1, side2, main } = template.f;
  const x = 100 - 3.3 - FOOT_SIDE_WIDTH;
  const h = side2.v ? side2.y + side2.h - side1.y : side1.h;
  return { ...template, f: { ...template.f,
    side1: { ...side1, x, w: FOOT_SIDE_WIDTH, h, fs: side1.fs ?? side1.h * TILE_SLOTS.side1.k },
    main: { ...main, w: x - 1 - main.x },
  } };
}

// „11 min temu”, „2 h temu” — wiek pogody w stopce kafelka pogody
const agoLabel = (ms: number) => `${ageLabel(ms)} temu`;
const number1 = (value: number) => value.toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// Kafelek pogody: ikona nieba, nazwa, temperatura z opisem nieba, po prawej wiatr i zachmurzenie, w wierszu opad,
// w stopce źródło i wiek. Dom: temperatura z czujnika kotła, gdy jest świeża (outdoor z GET /temperature).
export function weatherSlots(tile: WeatherTile, now: number, outdoor?: OutdoorConditions | null): Slots {
  const weather = tile.weather;
  const slots: Slots = {
    icon: weather ? <WeatherIcon weather={weather} /> : <Pictogram name="sun" />,
    name: <span className="tt-ellipsis">{tile.name}</span>,
  };
  const boiler = tile.home && outdoor?.temperatureSource === 'boiler' && typeof outdoor.temperature === 'number';
  const temperature = boiler ? outdoor!.temperature! : weather?.temperature;
  slots.main = <b>{typeof temperature === 'number' ? `${number1(temperature)} °C` : '--- °C'}</b>;
  // bez ikony przy temperaturze opis nieba zaczyna się pod liczbą i ma całą szerokość lewej kolumny
  slots.fullLabel = true;
  if (weather) {
    // źródło temperatury w stopce: pod liczbą zostaje sam opis nieba (dłuższy tekst nie mieścił się na telefonie)
    slots.mainLabel = weatherDescription(weather.code);
    slots.side1 = <span className="tt-fact"><Pictogram name="waves" /><b>{Math.round(weather.windSpeed)} km/h</b><small>wiatr</small></span>;
    slots.side2 = <span className="tt-fact"><Pictogram name="bubbles" /><b>{Math.round(weather.cloudCover)} %</b><small>chmury</small></span>;
    slots.row = <span className="tt-row"><span className="tt-fact"><Pictogram name="drop" /><b>{precipitationText(weather)}</b></span></span>;
    slots.footer = <span>{boiler ? 'czujnik kotła · ' : ''}Open-Meteo · {agoLabel(now - new Date(weather.at).getTime())}</span>;
  } else {
    slots.mainLabel = boiler ? 'czujnik kotła' : 'brak pogody z włącznika';
    slots.footer = <span>{tile.home ? 'włącznik nie zgłosił pogody od 45 min' : 'czeka na włącznik (firmware od 1.2.0)'}</span>;
  }
  return slots;
}

export type TileDesign = { selected: TileSlot | null; bad: Set<TileSlot> };

// Pola w jednostkach cqw szerokości kafelka (kontener .tt-box): wysokość kafelka może być większa niż ze wzoru
// (wyrównanie w wierszu listy), stopka jest wtedy przy dole, reszta zostaje u góry.
export function TileFields({ template, slots, design }: { template: TileTemplate; slots: Slots; design?: TileDesign }) {
  const cqw = (percentOfHeight: number) => `${(percentOfHeight / 100 * template.h / template.w * 100).toFixed(2)}cqw`;
  return (
    <>
      {TILE_SLOT_KEYS.map((key) => {
        const field = template.f[key];
        let content = slots[key];
        const empty = key !== 'divider' && (content === undefined || content === null);
        if (!field?.v || (empty && !design)) return null;
        const selected = design?.selected === key;
        // puste pole w projektancie: sama przerywana ramka (podpis tylko w zaznaczonym), żeby nie zasłaniało wartości
        if (empty) content = selected ? TILE_SLOTS[key].label : null;
        const k = TILE_SLOTS[key].k;
        const classes = [`tt-f tt-f-${key} tt-a-${field.a}`];
        if (design) classes.push('tt-design');
        if (design && empty) classes.push('tt-empty-slot');
        if (selected) classes.push('tt-selected');
        if (design?.bad.has(key)) classes.push('tt-bad');
        return (
          <span key={key} data-slot={key} title={design ? TILE_SLOTS[key].label : undefined} className={classes.join(' ')} style={{
            left: `${field.x}cqw`, width: `${field.w}cqw`, height: cqw(field.h),
            ...(key === 'footer' && !design ? { bottom: cqw(100 - field.y - field.h) } : { top: cqw(field.y) }),
            fontSize: k ? cqw(field.fs ?? field.h * k) : undefined,
          }}>
            {selected ? <><span className="tt-clip">{content}</span><span className="tt-resize" data-resize="1" /></> : content}
          </span>
        );
      })}
    </>
  );
}

// Kafelek z obramowaniem stanu; loading: duszek (pulsujące tło) w miejscu wartości.
export function TemplateTile({ template, deviceType, name, tile, now, loading, design, children, slots: given, level: givenLevel }: {
  template: TileTemplate; deviceType?: DeviceType; name?: string; tile?: DeviceTile; now: number;
  loading?: boolean; design?: TileDesign; children?: ReactNode;
  /** gotowa treść pól (kafelek pogody) zamiast danych sterownika */
  slots?: Slots;
  /** kolor paska zamiast poziomu ze sterownika (pogoda: sky) */
  level?: string;
}) {
  const slots = given ?? (deviceType && name !== undefined ? deviceSlots(deviceType, name, tile, now) : {});
  const level = givenLevel ?? tile?.level ?? 'off';
  // pola bez treści znikają i kafelek jest niższy (jak na produkcji),
  // bez wartości bocznych wartość główna jest szersza; w projektancie zawsze pełny wzór
  let shape = template;
  if (!design && loading && !tile && !given) {
    // duszek przed pierwszą odpowiedzią: wysokość zwykłego kafelka (bez ostrzeżenia, stopka w jednym wierszu), żeby
    // kafelek nie urósł po wczytaniu danych
    shape = collapseFooterLine(collapseEmpty(shape, new Set(TILE_SLOT_KEYS.filter((key) => key !== 'warning'))));
  } else if (!design) {
    shape = collapseEmpty(shape, new Set(TILE_SLOT_KEYS.filter((key) => slots[key] != null)));
    if (!(tile?.foot && tile.updatedAt) || slots.footInSide) shape = collapseFooterLine(shape); // stopka ma jeden wiersz
    if (!slots.side1 && !slots.side2 && !slots.side3) shape = widenMain(shape);
    if (slots.side1 && !slots.side2 && !slots.side3 && !slots.footInSide) shape = centerSingleSide(shape);
    if (slots.footInSide) shape = footSideShape(shape);
    if (slots.fullLabel) shape = { ...shape, f: { ...shape.f, mainLabel: { ...shape.f.mainLabel, x: shape.f.main.x, w: shape.f.main.w } } };
  }
  const labelFs = (shape.f.mainLabel.fs ?? shape.f.mainLabel.h * TILE_SLOTS.mainLabel.k) / 100 * shape.h / shape.w * 100;
  return (
    <span className="tt-box">
      <span className={`tt tt-${level}${tile?.running ? ' tt-running' : ''}${loading && !tile ? ' tt-loading' : ''}`}
        style={{
          // co najmniej wysokość ze wzoru; w wierszu listy kafelek może być wyższy (wyrównanie do najwyższego)
          minHeight: `${(shape.h / shape.w * 100).toFixed(2)}cqw`,
          // podpisy pod wartościami głównymi (tt-under) mają czcionkę pola Opis wartości
          '--tt-label-fs': `${labelFs.toFixed(2)}cqw`,
        } as CSSProperties}>
        <TileFields template={shape} slots={slots} design={design} />
        {children}
      </span>
    </span>
  );
}
