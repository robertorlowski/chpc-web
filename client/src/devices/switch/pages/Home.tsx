// Widok główny włącznika (/): dla każdego przekaźnika stan (przełącznik jak „CO pompa”), tryb,
// odliczanie do końca włączenia, przyciski „Włącz teraz” i „Włącz wg harmonogramu” (na środku), czas włączenia
// pod nimi i szeroki „Wyłącz” na dole („Włącz teraz” na ten czas, 0 h 0 min = bez limitu; PUT /switch/mode)
// oraz dzisiejsze włączenia (GET /switch/activations). Dane odświeża WebSocket „update” (zmiana stanu
// zgłoszona przez sterownik) i odpytywanie co 5 s (tryb timer i harmonogram zmieniają się z czasem).
import { useEffect, useState } from 'react';
import { DeviceRequests } from '../../../core/api';
import { wsAddressServer } from '../../../core/http';
import { getSelectedDevice } from '../../../core/context/DeviceContext';
import { SwitchRequests } from '../api';
import { RelayMode, SwitchActivation, SwitchRelay } from '../types';
import {
  describeMode, formatCountdown, formatDuration, formatMoment, formatTime,
  relayLabel, secondsInDay, todayWarsaw, warsawDayBounds,
} from '../utils/format';
import swith_on from '../../../assets/swith_on.svg';
import swith_off from '../../../assets/swith_off.svg';
import './style.css';
import { OfflineBanner } from '../../../core/components/OfflineBanner';

const REFRESH_MS = 5_000;

// Karta jednego przekaźnika z przyciskami trybu.
const RelayCard: React.FC<{
  relay: SwitchRelay;
  now: number;
  defaultMinutes: number;
  busy: boolean;
  onMode: (mode: RelayMode, minutes?: number) => void;
}> = ({ relay, now, defaultMinutes, busy, onMode }) => {
  const [hours, setHours] = useState(String(Math.floor(defaultMinutes / 60)));
  const [minutes, setMinutes] = useState(String(defaultMinutes % 60));
  useEffect(() => {
    setHours(String(Math.floor(defaultMinutes / 60)));
    setMinutes(String(defaultMinutes % 60));
  }, [defaultMinutes]);

  const mode = describeMode(relay);
  // „Włącz” na czas z pól pod przyciskami; 0 h 0 min = bez limitu
  const timerMinutes = (Number(hours) || 0) * 60 + (Number(minutes) || 0);
  const timeValid = timerMinutes >= 0 && timerMinutes <= 10080;
  const turnOn = () => (timerMinutes > 0 ? onMode('timer', timerMinutes) : onMode('on'));
  const title = relay.on ? 'Przekaźnik włączony (stan ze sterownika)' : 'Przekaźnik wyłączony (stan ze sterownika)';

  return (
    <div className="resource">
      <div className="switch-relay-header">
        <h3 className="settings-section-title">{relayLabel(relay)}</h3>
        <img className="switch-indicator" title={title} alt={title} src={relay.on ? swith_on : swith_off} />
      </div>
      <div className={`switch-mode${mode.danger ? ' switch-mode-danger' : ''}`}>{mode.text}</div>
      {!relay.online && (
        <OfflineBanner since={relay.lastSeenAt ?? undefined} now={now} detail={relay.lastSeenAt ? undefined : 'sterownik jeszcze się nie zgłosił.'} />
      )}
      {relay.on !== relay.desiredOn && relay.online && (
        <div className="switch-hint">Czeka na sterownik…</div>
      )}
      {relay.desiredOn && relay.until && (
        <div className="switch-countdown" title={`Wyłączenie o ${formatTime(relay.until)}`}>
          {formatCountdown(relay.until, now)}
        </div>
      )}
      <div className="switch-actions">
        <button type="button" disabled={busy || !timeValid}
          className={relay.mode === 'on' || relay.mode === 'timer' ? 'switch-active' : ''}
          onClick={turnOn}>Włącz teraz</button>
        <button type="button" disabled={busy || relay.mode === 'schedule'} className="switch-secondary"
          onClick={() => onMode('schedule')}>Włącz wg harmonogramu</button>
      </div>
      <div className="switch-timer">
        <span>Czas włączenia</span>
        <input type="number" min={0} max={168} value={hours} aria-label="Godziny"
          onChange={(event) => setHours(event.currentTarget.value)} /> h
        <input type="number" min={0} max={59} value={minutes} aria-label="Minuty"
          onChange={(event) => setMinutes(event.currentTarget.value)} /> min
      </div>
      <div className="switch-hint">
        {!timeValid ? 'Najwyżej 7 dni (168 h).' : timerMinutes === 0 ? '0 h 0 min: „Włącz teraz” bez limitu czasu.' : '0 h 0 min = bez limitu czasu.'}
      </div>
      {/* „Wyłącz” na dole karty, na całą szerokość */}
      <button type="button" disabled={busy}
        className={`switch-stop switch-stop-wide${relay.mode === 'off' ? ' switch-active' : ''}`}
        onClick={() => onMode('off')}>Wyłącz / wyłącz harmonogram</button>
    </div>
  );
};

export const SwitchHome: React.FC = () => {
  const [relays, setRelays] = useState<SwitchRelay[] | null>(null);
  const [activations, setActivations] = useState<SwitchActivation[] | null>(null);
  const [defaultMinutes, setDefaultMinutes] = useState(30);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState('');

  const load = () => {
    SwitchRequests.getRelays().then((result) => result && setRelays(result));
    SwitchRequests.getActivations(todayWarsaw()).then((result) => result && setActivations(result));
  };

  useEffect(() => {
    load();
    DeviceRequests.getDeviceProperties().then((result) => {
      if (typeof result?.default_on_minutes === 'number') setDefaultMinutes(result.default_on_minutes);
    });
    const refresh = window.setInterval(load, REFRESH_MS);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);

    // „update” wysyła serwer, gdy sterownik zgłosi zmianę stanu przekaźnika
    const device = getSelectedDevice();
    const wsUrl = new URL(wsAddressServer());
    if (device) wsUrl.searchParams.set('rootId', device.rootId);
    const ws = new WebSocket(wsUrl.toString());
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as { type?: string };
        if (message.type === 'update') load();
      } catch { /* inne komunikaty */ }
    };
    return () => {
      window.clearInterval(refresh);
      window.clearInterval(clock);
      ws.close();
    };
  }, []);

  const changeMode = async (relay: number, mode: RelayMode, minutes?: number) => {
    setBusy(relay);
    setError('');
    try {
      const updated = await SwitchRequests.setMode(relay, mode, minutes);
      setRelays((current) => current?.map((item) => item.relay === relay ? updated : item) ?? null);
    } catch {
      setError('Nie udało się zmienić trybu przekaźnika.');
    } finally {
      setBusy(null);
    }
  };

  const names = new Map((relays ?? []).map((relay) => [relay.relay, relayLabel(relay)]));
  const { start, end } = warsawDayBounds(todayWarsaw());
  const total = (activations ?? []).reduce((sum, activation) => sum + secondsInDay(activation, start, end, now), 0);
  const sorted = [...(activations ?? [])].reverse();

  return (
    <div className="settings switch-page">
      <h2>Włącznik</h2>
      <section>
        {relays === null && <div className="resource">Wczytywanie…</div>}
        {relays?.length === 0 && <div className="resource">Sterownik nie zgłosił jeszcze przekaźników.</div>}
        {error && <div className="resource switch-error">{error}</div>}
        {relays?.map((relay) => (
          <RelayCard key={relay.relay} relay={relay} now={now} defaultMinutes={defaultMinutes}
            busy={busy === relay.relay} onMode={(mode, minutes) => changeMode(relay.relay, mode, minutes)} />
        ))}

        <div className="resource">
          <h3 className="settings-section-title">Dziś</h3>
          {activations === null && <div>Wczytywanie…</div>}
          {activations?.length === 0 && <div>Dziś nie było włączeń.</div>}
          {sorted.length > 0 && (
            <>
              <table className="switch-table switch-table-wrap">
                <tbody>
                  {sorted.map((activation) => (
                    <tr key={activation._id} className={activation.offAt ? '' : 'switch-row-active'}>
                      {(relays?.length ?? 0) > 1 && <td>{names.get(activation.relay)}</td>}
                      <td className="switch-nowrap">{formatMoment(activation.onAt)} – {activation.offAt ? formatMoment(activation.offAt) : '…'}</td>
                      <td className="switch-num switch-nowrap">{activation.offAt ? formatDuration(activation.durationS) : 'w toku'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="switch-total">Razem: <strong>{formatDuration(total)}</strong></div>
            </>
          )}
        </div>
      </section>
    </div>
  );
};
