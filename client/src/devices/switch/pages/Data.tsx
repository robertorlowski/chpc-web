// Zakładka Dane włącznika (/data): włączenia przekaźników w wybranym dniu (GET /switch/activations)
// z czasem włączenia i wyłączenia, czasem trwania, łącznym czasem w dniu i eksportem CSV.
import { useEffect, useState } from 'react';
import { SwitchRequests } from '../api';
import { SwitchActivation, SwitchRelay } from '../types';
import {
  activationsToCsv, downloadText, formatDuration, formatTimeSeconds, relayLabel,
  secondsInDay, todayWarsaw, warsawDayBounds,
} from '../utils/format';
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

  useEffect(() => {
    SwitchRequests.getRelays().then((result) => result && setRelays(result));
  }, []);

  useEffect(() => {
    setActivations(null);
    SwitchRequests.getActivations(date).then((result) => setActivations(result ?? []));
  }, [date]);

  const names = new Map(relays.map((relay) => [relay.relay, relayLabel(relay)]));
  const shown = (activations ?? []).filter((activation) => !relayFilter || activation.relay === relayFilter);
  const now = Date.now();
  const { start, end } = warsawDayBounds(date);
  const total = shown.reduce((sum, activation) => sum + secondsInDay(activation, start, end, now), 0);

  return (
    <div className="settings switch-page">
      <h2>Dane</h2>
      <section>
        <div className="resource">
          <div className="switch-toolbar">
            <label>Dzień:{' '}
              <input type="date" value={date} onChange={(event) => event.currentTarget.value && setDate(event.currentTarget.value)} />
            </label>
            {relays.length > 1 && (
              <select value={relayFilter} onChange={(event) => setRelayFilter(Number(event.currentTarget.value))}>
                <option value={0}>Wszystkie przekaźniki</option>
                {relays.map((relay) => <option key={relay.relay} value={relay.relay}>{relayLabel(relay)}</option>)}
              </select>
            )}
            <button className="switch-toolbar-end" type="button" disabled={shown.length === 0}
              onClick={() => downloadText(activationsToCsv(shown, names), `wlacznik-${date}.csv`)}>
              CSV
            </button>
          </div>

          {activations === null && <div>Wczytywanie…</div>}
          {activations !== null && shown.length === 0 && <div>Brak włączeń w tym dniu.</div>}
          {shown.length > 0 && (
            <>
              <div className="switch-table-scroll">
                <table className="switch-table">
                  <thead>
                    <tr>
                      {relays.length > 1 && <th>Przekaźnik</th>}
                      <th>Włączenie</th>
                      <th>Wyłączenie</th>
                      <th className="switch-num">Czas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((activation) => (
                      <tr key={activation._id} className={activation.offAt ? '' : 'switch-row-active'}>
                        {relays.length > 1 && <td>{names.get(activation.relay)}</td>}
                        <td>{momentIn(activation.onAt, date)}</td>
                        <td title={activation.approximate ? 'Czas przybliżony: sterownik stracił zasilanie albo łączność' : undefined}>
                          {activation.offAt ? `${activation.approximate ? '≈ ' : ''}${momentIn(activation.offAt, date)}` : '—'}
                        </td>
                        <td className="switch-num">{activation.offAt ? formatDuration(activation.durationS) : 'w toku'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="switch-total">Razem w dniu: <strong>{formatDuration(total)}</strong></div>
            </>
          )}
        </div>
      </section>
    </div>
  );
};
