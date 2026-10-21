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
import { getLang, locale, useLang } from '../../../core/i18n';
import './style.css';

const TIME_ZONE = 'Europe/Warsaw';
const dayOf = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TIME_ZONE });

// godzina z sekundami, a dla włączeń przez północ także data
const momentIn = (iso: string, date: string) => {
  const time = formatTimeSeconds(iso);
  if (dayOf(iso) === date) return time;
  const day = new Date(iso).toLocaleDateString(locale(getLang()), { timeZone: TIME_ZONE, day: '2-digit', month: '2-digit' });
  return `${day} ${time}`;
};

export const SwitchData: React.FC = () => {
  const { t } = useLang();
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
          <button type="button" className="icon-btn sm" aria-label={t('common.prevDay')} onClick={() => setDate(shiftDate(date, -1))}><PrevIcon /></button>
          <span className="date-cur">
            <button type="button" className="date-pick" title={t('common.pickFromCalendar')} onClick={openPicker}>
              {formatDateLabel(date)}{date === today && <small>{t('wx.today')}</small>}
            </button>
            <input ref={dateInput} type="date" className="date-hidden" tabIndex={-1} aria-label={t('common.day')} value={date} max={today}
              onChange={(event) => event.currentTarget.value && setDate(event.currentTarget.value)} />
          </span>
          <button type="button" className="icon-btn sm" aria-label={t('common.nextDay')} disabled={date >= today}
            onClick={() => setDate(shiftDate(date, 1))}><NextIcon /></button>
        </div>
        {relays.length > 1 && (
          <div className="segmented seg-inline" role="radiogroup" aria-label={t('sw.relay')}>
            <label className="seg">
              <input type="radio" name="sw-dane-r" checked={relayFilter === 0} onChange={() => setRelayFilter(0)} />
              <span>{t('ops.filter.all')}</span>
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
          <h2>{t('sw.data.title')}</h2>
          {shown.length > 0 && <span className="card-hint">{t('sw.data.total', { time: formatDuration(total) })}</span>}
        </header>
        {activations === null && <p className="help">{t('common.loading')}</p>}
        {activations !== null && shown.length === 0 && <p className="help">{t('sw.data.none')}</p>}
        {shown.length > 0 && (
          <ActivationsTable activations={shown} names={names} showRelay={relays.length > 1}
            moment={(iso) => momentIn(iso, date)} />
        )}
        <footer className="table-foot">{t('sw.data.foot')}</footer>
      </section>
    </div>
  );
};
