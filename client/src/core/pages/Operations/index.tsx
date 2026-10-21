// Zakładka „Operacje” (/operations; pompa ciepła, hydrofor, włącznik i piec): dziennik operacji wybranego sterownika
// z dnia (GET /api/operations?date=) w wyglądzie „Instrument” z makiet/ (#s-*-operacje, 2026-10-17). Filtry: dzień
// (.date-nav: strzałki albo kalendarz; dziennik trzyma 5 dni) i źródło (.segmented: Wszystkie / Użytkownik / System).
// Karta „Zaplanowane” (tylko dziś: zlecenia w toku i przejścia harmonogramu do końca doby) i karta „Operacje w dniu”
// (wykonane, najnowsze u góry) z osią czasu .timeline: godzina, kto i skąd, co (dlaczego, warunki, błąd), chip stanu.
// Dziś odświeżanie co 30 s i po komunikacie WebSocket „update”.
import { useCallback, useEffect, useState } from 'react';
import { OperationRequests } from '../../api';
import { getSelectedDevice } from '../../context/DeviceContext';
import { wsAddressServer } from '../../http';
import { OperationEntry, OperationStatus, OperationsDay } from '../../types';
import { IconButton } from '../../components/IconButton';
import { getLang, t as tr, useLang } from '../../i18n';
import { locale } from '../../i18n';
import './style.css';

const TIME_ZONE = 'Europe/Warsaw';
const REFRESH_MS = 30_000;
// jak OPERATION_LOG_RETENTION_DAYS na serwerze (indeks TTL kolekcji operation_log)
const RETENTION_DAYS = 5;

type Filter = 'all' | 'user' | 'system';
const FILTERS: Filter[] = ['all', 'user', 'system'];

// chip stanu (.chip-* z makiety): zielony wykonane, pomarańczowy w toku, czerwony błąd, szary reszta; tekst ops.status.<stan>
const STATUS: Record<OperationStatus, string> = {
  planned: 'chip-off',
  pending: 'chip-warn',
  sent: 'chip-warn',
  // odebrana przez sterownik, który nie potwierdza wykonania (pompa ciepła, hydrofor): status końcowy
  delivered: 'chip-ok',
  done: 'chip-ok',
  error: 'chip-err',
  replaced: 'chip-off',
};

const todayWarsaw = () => new Date().toLocaleDateString('en-CA', { timeZone: TIME_ZONE });
const shiftDate = (date: string, days: number) => {
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
};
const time = (iso: string, seconds = false) => new Date(iso).toLocaleTimeString(locale(getLang()), {
  timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}),
});
const dateLabel = (date: string) => date.split('-').reverse().join('.');

// użytkownik: osoba z aplikacji albo ze strony sterownika; system: harmonogram, cykl Zimy itp.
const actorName = (entry: OperationEntry) => entry.actor.name
  ?? (entry.actor.type === 'system' ? tr('ops.actorSystem') : entry.actor.type === 'controller' ? tr('ops.actorController') : tr('ops.actorUser'));
const matches = (entry: OperationEntry, filter: Filter) =>
  filter === 'all' || (filter === 'system' ? entry.actor.type === 'system' : entry.actor.type !== 'system');

// wpis warunkowy (np. cykl Zimy): bez godziny, status „czeka na warunek”; po wykonaniu jest w wykonanych z godziną
const when = (entry: OperationEntry) => (entry.conditional ? '—' : time(entry.at));
const statusText = (entry: OperationEntry) => {
  if (entry.conditional && entry.status === 'planned') return tr('ops.waitingCondition');
  const text = tr(`ops.status.${entry.status}`);
  return (entry.status === 'done' || entry.status === 'delivered') && entry.statusAt ? `${text} ${time(entry.statusAt, true)}` : text;
};

// kolor lewej kreski wpisu: użytkownik (akcent), system (niebieski), błąd (czerwony)
const lineClass = (entry: OperationEntry) =>
  entry.status === 'error' ? 'tl-err' : entry.actor.type === 'system' ? 'tl-sys' : 'tl-user';

const key = (entry: OperationEntry, index: number) => entry.id ?? `${entry.at}-${index}`;

const PrevIcon = () => <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>;
const NextIcon = () => <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>;

// Oś czasu: godzina, kto i skąd, co (dlaczego, warunki; przy błędzie najpierw przyczyna), chip stanu.
const Timeline: React.FC<{ entries: OperationEntry[]; planned?: boolean }> = ({ entries, planned }) => (
  <ol className="timeline">
    {entries.map((entry, index) => (
      <li key={key(entry, index)} className={`tl ${lineClass(entry)}${planned && entry.status === 'planned' ? ' tl-planned' : ''}`}>
        <span className="tl-time">{when(entry)}</span>
        <span className="tl-who">{actorName(entry)} · {entry.source}</span>
        <span className="tl-what">
          <strong>{entry.action}</strong>
          {entry.error && <span className="tl-error"> {tr('ops.error')}: {entry.error}</span>}
          {entry.reason && <> {entry.reason}</>}
          {entry.conditions && <small className="tl-cond">{tr('ops.conditions')}: {entry.conditions}</small>}
        </span>
        <span className={`tl-state chip ${STATUS[entry.status]}`}>{statusText(entry)}</span>
      </li>
    ))}
  </ol>
);

export const OperationsPage: React.FC = () => {
  const { t, tn } = useLang();
  const today = todayWarsaw();
  const [date, setDate] = useState(today);
  const [filter, setFilter] = useState<Filter>('all');
  const [day, setDay] = useState<OperationsDay | null | undefined>(undefined);

  const load = useCallback(() => {
    OperationRequests.getDay(date).then((result) => setDay(result));
  }, [date]);

  useEffect(() => {
    setDay(undefined);
    load();
    if (date !== todayWarsaw()) return undefined;
    const refresh = window.setInterval(load, REFRESH_MS);
    // „update” wysyła serwer po zapisie operacji i zmianie jej statusu (także po telemetrii sterownika)
    const device = getSelectedDevice();
    const wsUrl = new URL(wsAddressServer());
    if (device) wsUrl.searchParams.set('rootId', device.rootId);
    const ws = new WebSocket(wsUrl.toString());
    ws.onmessage = (event) => {
      try {
        if ((JSON.parse(event.data) as { type?: string }).type === 'update') load();
      } catch { /* inne komunikaty */ }
    };
    return () => {
      window.clearInterval(refresh);
      ws.close();
    };
  }, [date, load]);

  const minDate = shiftDate(today, -RETENTION_DAYS);
  const planned = (day?.planned ?? []).filter((entry) => matches(entry, filter));
  const done = (day?.done ?? []).filter((entry) => matches(entry, filter));

  return (
    <div className="page operations-page">
      <div className="filters">
        <div className="date-nav">
          <IconButton label={t('common.prevDay')} icon={<PrevIcon />} disabled={date <= minDate} onClick={() => setDate(shiftDate(date, -1))} />
          <label className="date-cur">
            {dateLabel(date)}{date === today && <small>{t('wx.today')}</small>}
            <input type="date" value={date} min={minDate} max={today} aria-label={t('common.day')}
              onClick={(event) => event.currentTarget.showPicker?.()}
              onChange={(event) => event.currentTarget.value && setDate(event.currentTarget.value)} />
          </label>
          <IconButton label={t('common.nextDay')} icon={<NextIcon />} disabled={date >= today} onClick={() => setDate(shiftDate(date, 1))} />
        </div>
        <div className="segmented seg-inline" role="radiogroup" aria-label={t('ops.source')}>
          {FILTERS.map((item) => (
            <label key={item} className="seg">
              <input type="radio" name="op-src" checked={filter === item} onChange={() => setFilter(item)} />
              <span>{t(`ops.filter.${item}`)}</span>
            </label>
          ))}
        </div>
      </div>

      {day?.today && (
        <section className="card">
          <header className="card-head"><h2>{t('ops.planned')}</h2><span className="card-hint">{t('ops.plannedHint')}</span></header>
          {planned.length ? <Timeline entries={planned} planned /> : <p className="help">{t('ops.nothingPlanned')}</p>}
        </section>
      )}

      <section className="card">
        <header className="card-head">
          <h2>{t('ops.inDay')}</h2>
          {day && <span className="card-hint">{done.length ? `${tn('ops.events', done.length)} · ${t('ops.newestFirst')}` : t('wx.none')}</span>}
        </header>
        {day === undefined && <p className="help">{t('common.loading')}</p>}
        {day === null && <div className="alert alert-err" role="alert"><div><strong>{t('ops.loadFailed')}</strong></div></div>}
        {day && done.length === 0 && <p className="help">{t('ops.noneInDay')}</p>}
        {day && done.length > 0 && <Timeline entries={done} />}
      </section>
    </div>
  );
};
