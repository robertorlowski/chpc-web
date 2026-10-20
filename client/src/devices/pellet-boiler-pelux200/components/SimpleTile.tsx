// Kafelek prosty pieca na liście sterowników (2026-10-21; makieta: artefakt „Tryb prosty – makieta”, plansze P1–P5).
// Dla osoby, która ma tylko włączać i wyłączać piec: „Piec wyłączony / włączony” z opisem ogrzewania domu i kotła,
// chip „Włączony · Zima” w nagłówku, plakietka „Praca” przy paleniu, przyciski „Włącz piec” (Zima + CWU), „Wyłącz piec”
// i „Włącz CWU” / „Wyłącz CWU” z temperaturą CWU pod spodem. Rysowany zamiast DeviceTileCard, gdy device.simple.
// Dane z GET /devices/summary (DeviceTile.boiler), akcje POST /pellet-boiler-pelux200/simple z jawnym rootId
// (serwer składa: harmonogram, control, nr 122, Zima; 409, gdy „włącz” rozpaliłoby kocioł w trybie pompy ciepła).
import { useEffect, useState } from 'react';
import { SimpleBoilerState, SimpleTileProps } from '../../../core/types';
import { ListIcon } from '../../../core/components/DeviceTileCard';
import { PelletBoilerRequests } from '../api';
import '../../../core/components/simpleTile.css';

type Action = 'on' | 'off' | 'cwu-on' | 'cwu-off';
const SEASON_LABEL = { winter: 'Zima', summer: 'Lato' } as const;
const temp = (value: number | null) => (value === null ? '—' : `${value.toLocaleString('pl-PL', { maximumFractionDigits: 1 })} °C`);

export function PelletBoilerSimpleTile({ device, name, tile, now: _now, loading, tools, onOpen, onChanged }: SimpleTileProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const boiler: SimpleBoilerState | undefined = tile?.boiler;
  useEffect(() => { setBusy(false); }, [tile]);

  const send = async (action: Action) => {
    setBusy(true);
    setError('');
    try {
      await PelletBoilerRequests.simpleAction(device, action);
      onChanged();
    } catch (caught) {
      // 409: w trybie pompy ciepła „włącz” rozpaliłoby kocioł — komunikat serwera
      const failure = caught as { serverMessage?: string };
      setError(failure.serverMessage ?? 'Nie udało się wysłać polecenia. Spróbuj jeszcze raz.');
      setBusy(false);
    }
  };

  // chip w nagłówku: Offline (czerwony), Wyłączony (szary), Włączony · Zima / Lato (zielony), Wysyłanie… (szary)
  const chip = (() => {
    if (!boiler) return null;
    if (!boiler.online) return <span className="chip chip-err">Offline</span>;
    if (boiler.pending) return <span className="chip chip-off">Wysyłanie…</span>;
    if (boiler.regulatorOn === false) return <span className="chip chip-off">Wyłączony</span>;
    return <span className="chip chip-ok"><i className="dot" />Włączony{boiler.season ? ` · ${SEASON_LABEL[boiler.season]}` : ''}</span>;
  })();
  const head = (
    <div className="tile-head">
      <span className="tile-icon"><ListIcon name="fire" /></span>
      <h2 className="tile-name">{onOpen ? <button type="button" className="simple-open" onClick={onOpen} title="Otwórz pełne widoki pieca">{name}</button> : name}</h2>
      {chip}
      {tools && <span className="tile-tools">{tools}</span>}
    </div>
  );
  if (!boiler) {
    return <>{head}{loading ? <span className="skeleton skeleton-main" /> : <p className="simple-hint">Brak danych pieca.</p>}</>;
  }

  const on = boiler.regulatorOn !== false;
  const heating = boiler.season === 'winter' ? 'Ogrzewanie domu włączone (Zima)'
    : boiler.season === 'summer' ? 'Ogrzewanie domu wyłączone (Lato)' : 'Ogrzewanie domu —';
  const state = !boiler.online ? 'Piec nie odpowiada'
    : boiler.pending === 'control' ? (on ? 'Wyłączanie pieca…' : 'Włączanie pieca…')
    : on ? 'Piec włączony' : 'Piec wyłączony';
  const detail = !boiler.online ? 'sterownik pieca nie zgłasza się'
    : boiler.pending ? 'polecenie wysłane · piec potwierdzi w ciągu minuty'
    : `${on ? heating : 'Ogrzewanie domu wyłączone'} · kocioł ${temp(boiler.boilerTemp)}${!on || !boiler.burning ? '' : ''}`;
  const disabled = busy || !boiler.online || !!boiler.pending;
  const cwuLine = <p className="simple-hint"><b>CWU teraz {temp(boiler.cwuTemp)}, zadana {temp(boiler.cwuTarget)}</b></p>;

  return (
    <>
      {head}
      <div className="simple-state-row">
        <div className="simple-state">{state}<small>{detail}</small></div>
        {boiler.online && boiler.burning && <span className="state state-on is-running" title="Kocioł pali"><i className="dot" />Praca</span>}
      </div>
      {boiler.online && (
        <div className="simple-actions">
          {on ? (
            <>
              <div className="simple-act">
                <button type="button" className="btn btn-danger" disabled={disabled} onClick={() => void send('off')}>Wyłącz piec</button>
              </div>
              <div className="simple-act">
                {boiler.cwuOn === false
                  ? <button type="button" className="btn btn-primary" disabled={disabled} onClick={() => void send('cwu-on')}>Włącz CWU</button>
                  : <button type="button" className="btn btn-plain" disabled={disabled} onClick={() => void send('cwu-off')}>Wyłącz CWU</button>}
                {cwuLine}
              </div>
            </>
          ) : (
            <div className="simple-act">
              <button type="button" className="btn btn-primary" disabled={disabled} onClick={() => void send('on')}>Włącz piec</button>
            </div>
          )}
        </div>
      )}
      {error && <p className="simple-hint danger-text" role="alert">{error}</p>}
    </>
  );
}
