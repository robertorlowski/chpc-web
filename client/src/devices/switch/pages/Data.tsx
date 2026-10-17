// Zakładka Dane włącznika (/data), układ z makiety „Instrument” (#s-switch-dane): pasek filtrów (dzień strzałkami
// ‹ › albo z kalendarza po kliknięciu daty, przekaźnik przyciskami przy więcej niż jednym, CSV) i karta
// „Włączenia w dniu” (GET /switch/activations) z czasem włączenia i wyłączenia, czasem trwania, łącznym czasem
// w dniu i przypisem o czasie przybliżonym.
import { useEffect, useRef, useState } from 'react';
import { SwitchRequests } from '../api';
import { SwitchActivation, SwitchRelay } from '../types';
import {
  activationsToCsv, downloadText, formatDateLabel, formatDuration, formatTimeSeconds, relayLabel,
  secondsInDay, shiftDate, todayWarsaw, warsawDayBounds,
} from '../utils/format';
import { DownloadIcon, NextIcon, PrevIcon } from '../components/icons';
import { ActivationsTable } from '../components/ActivationsTable';
import './style.css';

const TIME_ZONE = 'Europe/Warsaw';
const dayOf = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TIME_ZONE });

// godzina z sekundami, a dla włączeń przez północ także data
const momentIn = (iso: string, date: string) => {
  const time = formatTimeSeconds(iso);
  if (dayOf(iso) === date) return time;
  const day = new Date(iso).toLocaleDateString('pl-PL', { timeZone: TIME_ZONE, day: '2-digit', month: '2-digit' });
  return `${day} ${time}`;
};

export const SwitchData: React.FC = () => {
  const [date, setDate] = useState(todayWarsaw());
  const [relayFilter, setRelayFilter] = useState(0);
  const [relays, setRelays] = useState<SwitchRelay[]>([]);
  const [activations, setActivations] = useState<SwitchActivation[] | null>(null);
  const dateInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    SwitchRequests.getRelays().then((result) => result && setRelays(result));
  }, []);

  useEffect(() => {
    setActivations(null);
    SwitchRequests.getActivations(date).then((result) => setActivations(result ?? []));
  }, [date]);

  const today = todayWarsaw();
  const names = new Map(relays.map((relay) => [relay.relay, relayLabel(relay)]));
  const shown = (activations ?? []).filter((activation) => !relayFilter || activation.relay === relayFilter);
  const now = Date.now();
  const { start, end } = warsawDayBounds(date);
  const total = shown.reduce((sum, activation) => sum + secondsInDay(activation, start, end, now), 0);

  // kalendarz przeglądarki pod datą (pole jest niewidoczne, otwiera je kliknięcie daty)
  const openPicker = () => {
    const input = dateInput.current;
    if (!input) return;
    if (typeof input.showPicker === 'function') input.showPicker();
    else input.focus();
  };

  return (
    <div className="page page-device switch-page">
      <div className="filters">
        <div className="date-nav">
          <button type="button" className="icon-btn sm" aria-label="Poprzedni dzień" onClick={() => setDate(shiftDate(date, -1))}><PrevIcon /></button>
          <span className="date-cur">
            <button type="button" className="date-pick" title="Wybierz dzień z kalendarza" onClick={openPicker}>
              {formatDateLabel(date)}{date === today && <small>dziś</small>}
            </button>
            <input ref={dateInput} type="date" className="date-hidden" tabIndex={-1} aria-label="Dzień" value={date} max={today}
              onChange={(event) => event.currentTarget.value && setDate(event.currentTarget.value)} />
          </span>
          <button type="button" className="icon-btn sm" aria-label="Następny dzień" disabled={date >= today}
            onClick={() => setDate(shiftDate(date, 1))}><NextIcon /></button>
        </div>
        {relays.length > 1 && (
          <div className="segmented seg-inline" role="radiogroup" aria-label="Przekaźnik">
            <label className="seg">
              <input type="radio" name="sw-dane-r" checked={relayFilter === 0} onChange={() => setRelayFilter(0)} />
              <span>Wszystkie</span>
            </label>
            {relays.map((relay) => (
              <label className="seg" key={relay.relay}>
                <input type="radio" name="sw-dane-r" checked={relayFilter === relay.relay} onChange={() => setRelayFilter(relay.relay)} />
                <span>{relayLabel(relay)}</span>
              </label>
            ))}
          </div>
        )}
        <button type="button" className="btn btn-ghost btn-sm" disabled={shown.length === 0}
          onClick={() => downloadText(activationsToCsv(shown, names), `wlacznik-${date}.csv`)}>
          <DownloadIcon />CSV
        </button>
      </div>

      <section className="card card-table">
        <header className="card-head">
          <h2>Włączenia w dniu</h2>
          {shown.length > 0 && <span className="card-hint">razem w dniu {formatDuration(total)}</span>}
        </header>
        {activations === null && <p className="help">Wczytywanie…</p>}
        {activations !== null && shown.length === 0 && <p className="help">Brak włączeń w tym dniu.</p>}
        {shown.length > 0 && (
          <ActivationsTable activations={shown} names={names} showRelay={relays.length > 1}
            moment={(iso) => momentIn(iso, date)} />
        )}
        <footer className="table-foot">„≈” = koniec po utracie zasilania (ostatnie zgłoszenie przed restartem). Włączenie przez północ liczy się do dnia startu.</footer>
      </section>
    </div>
  );
};
