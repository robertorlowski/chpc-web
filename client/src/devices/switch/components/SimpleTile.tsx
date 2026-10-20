// Kafelek prosty włącznika na liście sterowników (2026-10-20; makieta: artefakt „Tryb prosty – makieta”, plansze A–C).
// Dla osoby, która ma tylko włączać i wyłączać bojler: ok. pół ekranu telefonu, zdanie o stanie i dwa duże przyciski,
// każdy z opisem, co się stanie. Rysowany zamiast DeviceTileCard, gdy device.simple (przełącznik „Kafelek prosty”
// w oknie „Dane sterownika” albo udostępnienie „Panel prosty”). Dane z GET /devices/summary (TileRelay z polami
// kafelka prostego), polecenia PUT /switch/mode z jawnym rootId (lista nie ma wybranego sterownika).
// Stany i teksty (ustalenia użytkownika 2026-10-20):
//  A wyłączony ręcznie (off): „Włącz” → timer na onMinutes (0 = on), „Włączaj zgodnie z harmonogramem” → schedule;
//  B włączony (harmonogram, czas, bez limitu): „Wyłącz” → pause (wyłącza teraz, następne włączenie z harmonogramu
//    zostaje; poza oknem serwer zamienia na schedule), „Wyłącz harmonogram uruchamiania” → off;
//  C wyłączony z harmonogramu (schedule / pause): „Włącz” → timer, „Wyłącz harmonogram uruchamiania” → off.
import { useEffect, useState } from 'react';
import { SimpleTileProps, TileRelay } from '../../../core/types';
import { ListIcon } from '../../../core/components/DeviceTileCard';
import { SwitchRequests } from '../api';
import { RelayMode } from '../types';
import { formatDuration, whenText } from '../utils/format';
import './simpleTile.css';

// „30 min”, „1 h 30 min”
const minutesText = (minutes: number) => formatDuration(minutes * 60);

type Action = { label: string; sub?: string; kind: 'primary' | 'danger' | 'plain'; hint: string; mode: RelayMode; minutes?: number };

// Zdanie o stanie i przyciski przekaźnika według stanu z kafelka.
function describe(relay: TileRelay, online: boolean, onMinutes: number, now: number): { chip: string; chipClass: string; state: string; detail: string; actions: Action[] } {
  const name = relay.name;
  const until = relay.until ?? null;
  const next = relay.nextStart ?? null;
  const left = until ? Math.max(0, Math.round((new Date(until).getTime() - now) / 1000)) : 0;
  // „Włącz”: na domyślny czas z ustawień właściciela; 0 = bez limitu
  const turnOn = (back: string): Action => ({
    label: 'Włącz', sub: name, kind: 'primary',
    mode: onMinutes > 0 ? 'timer' : 'on', minutes: onMinutes > 0 ? onMinutes : undefined,
    hint: onMinutes > 0 ? `${name} uruchomi się teraz na ${minutesText(onMinutes)}${back}.` : `${name} włączy się teraz i zostanie włączony, aż go wyłączysz.`,
  });
  const stopSchedule = (hint: string): Action => ({ label: 'Wyłącz harmonogram uruchamiania', kind: 'plain', mode: 'off', hint });

  if (!online) {
    return { chip: 'Offline', chipClass: 'chip-warn', state: `${name}: brak łączności`, detail: 'sterownik nie zgłasza się od 5 min · przyciski nie działają', actions: [] };
  }
  if (relay.mode === 'off') {
    return {
      chip: 'Wyłączony', chipClass: 'chip-err', state: `${name} jest wyłączony`, detail: 'harmonogram uruchamiania jest wyłączony',
      actions: [
        turnOn(''),
        { label: 'Włączaj zgodnie z harmonogramem', kind: 'plain', mode: 'schedule',
          hint: next ? `${name} uruchomi się automatycznie ${whenText(next)}.` : `Brak zaplanowanych włączeń — ${name} pozostanie wyłączony.` },
      ],
    };
  }
  if (relay.desiredOn) {
    const detail = relay.mode === 'on' ? 'bez limitu czasu'
      : relay.mode === 'timer' ? `na czas · wyłączy się ${until ? whenText(until) : '—'} (zostało ${formatDuration(left)})`
      : `zgodnie z harmonogramem · wyłączy się ${until ? whenText(until) : '—'}`;
    return {
      chip: 'Włączony', chipClass: 'chip-ok', state: `${name} jest włączony`, detail,
      actions: [
        { label: 'Wyłącz', sub: name, kind: 'danger', mode: 'pause',
          hint: next ? `${name} wyłączy się teraz i będzie automatycznie uruchomiony ${whenText(next)}.` : `${name} wyłączy się teraz; brak zaplanowanych włączeń.` },
        stopSchedule(`${name} wyłączy się teraz i nie będzie automatycznie uruchomiony.`),
      ],
    };
  }
  const detail = relay.mode === 'pause' && until
    ? `do ${whenText(until)} · potem harmonogram${next ? ` (włączy się ${whenText(next)})` : ''}`
    : next ? `zgodnie z harmonogramem · włączy się ${whenText(next)}` : 'zgodnie z harmonogramem · brak zaplanowanych włączeń';
  return {
    chip: 'Wyłączony', chipClass: 'chip-off', state: `${name} jest wyłączony`, detail,
    actions: [
      turnOn(', a potem wróci do harmonogramu'),
      stopSchedule(`${name} nie będzie automatycznie uruchomiony.`),
    ],
  };
}

export function SwitchSimpleTile({ device, name, tile, now, loading, tools, onOpen, onChanged }: SimpleTileProps) {
  // przekaźnik, dla którego poszło polecenie: przyciski nieaktywne do odświeżenia kafelka
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { setBusy(null); }, [tile]);

  const send = async (relay: number, action: Action) => {
    setBusy(relay);
    setError('');
    try {
      await SwitchRequests.setModeFor(device, relay, action.mode, action.minutes);
      onChanged();
    } catch {
      setError('Nie udało się wysłać polecenia. Spróbuj jeszcze raz.');
      setBusy(null);
    }
  };

  const relays = tile?.relays ?? [];
  const online = tile?.chip === 'Online';
  // jeden przekaźnik z nazwą: jego nazwa w nagłówku kafelka (produkcja: włącznik „Włącznik”, przekaźnik „Bojler”)
  const title = relays.length === 1 && relays[0].name ? relays[0].name : name;
  const head = (
    <div className="tile-head">
      <span className="tile-icon"><ListIcon name="switch" /></span>
      <h2 className="tile-name">{onOpen ? <button type="button" className="simple-open" onClick={onOpen} title="Otwórz pełne widoki włącznika">{title}</button> : title}</h2>
      {tools && <span className="tile-tools">{tools}</span>}
    </div>
  );
  if (!tile) {
    return <>{head}{loading ? <span className="skeleton skeleton-main" /> : <p className="simple-hint">Brak danych włącznika.</p>}</>;
  }
  return (
    <>
      {head}
      {relays.map((relay) => {
        const view = describe(relay, online, tile.onMinutes ?? 30, now);
        const number = relay.relay ?? 1;
        const waiting = online && relay.desiredOn !== undefined && relay.on !== relay.desiredOn;
        return (
          <div key={number} className="simple-relay">
            <div className="simple-top">
              {relays.length > 1 && <span className="simple-relay-name">{relay.name}</span>}
              <span className={`chip ${view.chipClass}`}>{view.chip === 'Włączony' && <i className="dot" />}{view.chip}</span>
            </div>
            <div className="simple-state">{view.state}<small>{view.detail}</small></div>
            {waiting && <p className="simple-hint">Czeka na sterownik…</p>}
            <div className="simple-actions">
              {view.actions.map((action) => (
                <div key={action.label} className="simple-act">
                  <button type="button" className={`btn btn-${action.kind}`} disabled={busy !== null} onClick={() => void send(number, action)}>
                    {action.label}{action.sub && <small>{action.sub}</small>}
                  </button>
                  <p className="simple-hint">{action.hint}</p>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {error && <p className="simple-hint danger-text" role="alert">{error}</p>}
    </>
  );
}
