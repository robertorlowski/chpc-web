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
import { t as tr, useLang } from '../../../core/i18n';
import '../../../core/components/simpleTile.css';

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
    label: tr('sw.simple.turnOn'), sub: name, kind: 'primary',
    mode: onMinutes > 0 ? 'timer' : 'on', minutes: onMinutes > 0 ? onMinutes : undefined,
    hint: onMinutes > 0 ? tr('sw.simple.turnOnHint', { name, time: minutesText(onMinutes), back }) : tr('sw.simple.turnOnUnlimitedHint', { name }),
  });
  const stopSchedule = (hint: string): Action => ({ label: tr('sw.simple.stopSchedule'), kind: 'plain', mode: 'off', hint });

  if (!online) {
    // chipy (decyzja użytkownika 2026-10-20, wszystkie kafelki): Offline czerwony, Wyłączony szary
    return { chip: tr('chip.offline'), chipClass: 'chip-err', state: tr('sw.simple.noLink', { name }), detail: tr('sw.simple.noLinkDetail'), actions: [] };
  }
  if (relay.mode === 'off') {
    return {
      chip: tr('sw.simple.chipOff'), chipClass: 'chip-off', state: tr('sw.simple.isOff', { name }), detail: tr('sw.simple.scheduleStopped'),
      actions: [
        turnOn(''),
        { label: tr('sw.simple.followSchedule'), kind: 'plain', mode: 'schedule',
          hint: next ? tr('sw.simple.willStart', { name, when: whenText(next) }) : tr('sw.simple.noStartsStaysOff', { name }) },
      ],
    };
  }
  if (relay.desiredOn) {
    const detail = relay.mode === 'on' ? tr('sw.simple.unlimited')
      : relay.mode === 'timer' ? tr('sw.simple.timedDetail', { when: until ? whenText(until) : '—', left: formatDuration(left) })
      : tr('sw.simple.scheduleOnDetail', { when: until ? whenText(until) : '—' });
    return {
      chip: tr('sw.simple.chipOn'), chipClass: 'chip-ok', state: tr('sw.simple.isOn', { name }), detail,
      actions: [
        { label: tr('sw.simple.turnOff'), sub: name, kind: 'danger', mode: 'pause',
          hint: next ? tr('sw.simple.turnOffHint', { name, when: whenText(next) }) : tr('sw.simple.turnOffNoStarts', { name }) },
        stopSchedule(tr('sw.simple.stopScheduleOnHint', { name })),
      ],
    };
  }
  const detail = relay.mode === 'pause' && until
    ? `${tr('sw.simple.pausedUntil', { when: whenText(until) })}${next ? ` (${tr('sw.simple.willTurnOn', { when: whenText(next) })})` : ''}`
    : next ? tr('sw.simple.scheduleNextDetail', { when: whenText(next) }) : tr('sw.simple.scheduleNoStarts');
  return {
    chip: tr('sw.simple.chipOff'), chipClass: 'chip-off', state: tr('sw.simple.isOff', { name }), detail,
    actions: [
      turnOn(tr('sw.simple.backToSchedule')),
      stopSchedule(tr('sw.simple.stopScheduleOffHint', { name })),
    ],
  };
}

export function SwitchSimpleTile({ device, name, tile, now, loading, tools, onOpen, onChanged }: SimpleTileProps) {
  const { t } = useLang();
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
      setError(t('sw.simple.sendFailed'));
      setBusy(null);
    }
  };

  const relays = tile?.relays ?? [];
  const online = tile?.chip === 'Online';
  // jeden przekaźnik z nazwą: jego nazwa w nagłówku kafelka (produkcja: włącznik „Włącznik”, przekaźnik „Bojler”)
  const single = relays.length === 1;
  const title = single && relays[0].name ? relays[0].name : name;
  // jeden przekaźnik: chip stanu w nagłówku obok nazwy (jak na zwykłym kafelku), żeby nie zajmował osobnego wiersza
  const chipOf = (relay: TileRelay) => {
    const view = describe(relay, online, tile?.onMinutes ?? 30, now);
    return <span className={`chip ${view.chipClass}`}>{view.chipClass === 'chip-ok' && <i className="dot" />}{view.chip}</span>;
  };
  const head = (
    <div className="tile-head">
      <span className="tile-icon"><ListIcon name="switch" /></span>
      <h2 className="tile-name">{onOpen ? <button type="button" className="simple-open" onClick={onOpen} title={t('sw.simple.openViews')}>{title}</button> : title}</h2>
      {single && tile && chipOf(relays[0])}
      {tools && <span className="tile-tools">{tools}</span>}
    </div>
  );
  if (!tile) {
    return <>{head}{loading ? <span className="skeleton skeleton-main" /> : <p className="simple-hint">{t('sw.simple.noData')}</p>}</>;
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
            {!single && (
              <div className="simple-top">
                <span className="simple-relay-name">{relay.name}</span>
                {chipOf(relay)}
              </div>
            )}
            <div className="simple-state">{view.state}<small>{view.detail}</small></div>
            {waiting && <p className="simple-hint">{t('sw.waiting')}</p>}
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
