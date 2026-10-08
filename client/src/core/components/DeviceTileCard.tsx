// Zawartość kafelka sterownika na stronie /devices: nazwa, chip ze stanem, kluczowe wartości (po lewej główna,
// w prawej kolumnie reszta), drugi wiersz wartości albo przekaźniki włącznika, linia o błędzie lub ostrzeżeniu
// i stopka. Dane z GET /api/devices/summary (DeviceTile), bez nich kafelek ma tylko nazwę.
import { DeviceTile, DeviceType, TileFact } from '../types';
import { Pictogram } from './pictograms';

const TYPE_ICONS = {
  [DeviceType.HP]: 'waves',
  [DeviceType.WATER_PRESSURE_TANK]: 'drop',
  [DeviceType.PELLET_BOILER_PELUX200]: 'flame',
  [DeviceType.SWITCH]: 'power',
  [DeviceType.PHOTOVOLTAIC]: 'sun',
} as const;

// „8 s”, „5 min”, „3 h”, „2 dni” — wiek danych w stopce kafelka
export function ageLabel(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} dni`;
}

// Kolor chipu: „Online” zielony (niebieski przy pracy: sprężarka, palenie, produkcja), „Offline” pomarańczowy do godziny,
// potem czerwony (szary, gdy brak danych jest normalny, np. PV w nocy); inne napisy (hydrofor) według poziomu kafelka.
function chipClass(tile: DeviceTile): string {
  if (tile.running) return 'run';
  if (tile.chip === 'Online') return 'ok';
  if (tile.chip === 'Offline' && tile.level === 'ok') return 'off';
  return tile.level;
}

const Fact = ({ fact, big, noIcon }: { fact: TileFact; big?: boolean; noIcon?: boolean }) => (
  <span className={`tile-fact${big ? ' big' : ''}`}>
    {!noIcon && <span className="tile-fact-icon"><Pictogram name={fact.icon} /></span>}
    <span className="tile-fact-text">
      <b>{fact.value}</b>
      {fact.label ? <small>{fact.label}</small> : null}
    </span>
  </span>
);

// Duszek: szare, pulsujące bloki w miejscu wartości (kafelek ma tę samą wysokość co gotowy, więc nic nie skacze).
// Bez nazwy (lista urządzeń jeszcze się nie załadowała) szkielet ma też nagłówek.
function TileSkeleton({ withHead }: { withHead: boolean }) {
  return (
    <>
      {withHead && (
        <span className="tile-head">
          <span className="skeleton skeleton-icon" />
          <span className="skeleton skeleton-title" />
        </span>
      )}
      <span className="skeleton skeleton-main" />
      <span className="skeleton skeleton-row" />
      <span className="skeleton skeleton-foot" />
    </>
  );
}

export function DeviceTileCard({ deviceType, name, tile, now, loading }: {
  deviceType?: DeviceType; name?: string; tile?: DeviceTile; now: number;
  /** dane kafelka jeszcze się ładują: zamiast wartości duszek; bez name szkielet całego kafelka */
  loading?: boolean;
}) {
  if (loading && !tile) {
    return (
      <span className="tile tile-off tile-loading" aria-busy="true">
        {name && deviceType ? (
          <span className="tile-head">
            <span className="tile-type-icon"><Pictogram name={TYPE_ICONS[deviceType] ?? 'waves'} /></span>
            <strong className="tile-name">{name}</strong>
          </span>
        ) : null}
        <TileSkeleton withHead={!name} />
      </span>
    );
  }
  if (!deviceType || name === undefined) return null;
  // stopka: własny tekst rodzaju (np. „ostatnie uruchomienie …” hydroforu) i „dane sprzed …”, gdy znany jest czas danych
  const age = tile?.updatedAt ? `dane sprzed ${ageLabel(now - new Date(tile.updatedAt).getTime())}` : '';
  const footLines = [tile?.foot, age].filter((line): line is string => !!line);
  return (
    <span className={`tile tile-${tile?.level ?? 'off'}`}>
      <span className="tile-head">
        <span className="tile-type-icon"><Pictogram name={TYPE_ICONS[deviceType] ?? 'waves'} /></span>
        <strong className="tile-name">{name}</strong>
        {tile && <span className={`tile-chip ${chipClass(tile)}`}>{tile.chip}</span>}
      </span>

      {tile?.relays && (
        <span className="tile-relays">
          {tile.relays.map((relay) => (
            <span key={relay.name || 'solo'} className={`tile-relay${relay.name ? '' : ' solo'}`}>
              <span className={`tile-relay-dot${relay.on ? ' on' : ''}`} />
              {relay.name ? <b>{relay.name}</b> : null}
              <small>{relay.text}</small>
              {relay.detail ? <small className="tile-relay-detail">{relay.detail}</small> : null}
            </span>
          ))}
        </span>
      )}

      {tile?.main && (
        <span className="tile-facts tile-facts-main">
          <span className="tile-main-pair">
            <Fact fact={tile.main} big />
            {tile.main2 && <span className="tile-main-sep" aria-hidden="true">/</span>}
            {tile.main2 && <Fact fact={tile.main2} big noIcon />}
          </span>
          {tile.side?.length ? (
            <span className="tile-side">{tile.side.map((fact, index) => <Fact key={index} fact={fact} />)}</span>
          ) : null}
        </span>
      )}

      {tile?.row?.length ? (
        <span className="tile-facts tile-facts-row">{tile.row.map((fact, index) => <Fact key={index} fact={fact} />)}</span>
      ) : null}

      {tile?.note && (
        <span className={`tile-note ${tile.note.level}`}>
          <span className="tile-note-icon"><Pictogram name={tile.note.level === 'err' ? 'error' : 'warn'} /></span>
          <span>{tile.note.text}</span>
        </span>
      )}

      {footLines.length > 0 && (
        <span className="tile-foot">{footLines.map((line) => <span key={line}>{line}</span>)}</span>
      )}
    </span>
  );
}
