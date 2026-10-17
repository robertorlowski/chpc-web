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
import './style.css';

const TIME_ZONE = 'Europe/Warsaw';
const REFRESH_MS = 30_000;
// jak OPERATION_LOG_RETENTION_DAYS na serwerze (indeks TTL kolekcji operation_log)
const RETENTION_DAYS = 5;

type Filter = 'all' | 'user' | 'system';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Wszystkie' },
  { key: 'user', label: 'Użytkownik' },
  { key: 'system', label: 'System' },
];

// chip stanu (.chip-* z makiety): zielony wykonane, pomarańczowy w toku, czerwony błąd, szary reszta
const STATUS: Record<OperationStatus, { text: string; className: string }> = {
  planned: { text: 'zaplanowana', className: 'chip-off' },
  pending: { text: 'czeka na sterownik', className: 'chip-warn' },
  sent: { text: 'wysłana · czeka', className: 'chip-warn' },
  // odebrana przez sterownik, który nie potwierdza wykonania (pompa ciepła, hydrofor): status końcowy
  delivered: { text: 'dostarczona', className: 'chip-ok' },
  done: { text: 'wykonana', className: 'chip-ok' },
  error: { text: 'błąd', className: 'chip-err' },
  replaced: { text: 'zastąpiona', className: 'chip-off' },
};

const todayWarsaw = () => new Date().toLocaleDateString('en-CA', { timeZone: TIME_ZONE });
const shiftDate = (date: string, days: number) => {
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
};
const time = (iso: string, seconds = false) => new Date(iso).toLocaleTimeString('pl-PL', {
  timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}),
});
const dateLabel = (date: string) => date.split('-').reverse().join('.');

// użytkownik: osoba z aplikacji albo ze strony sterownika; system: harmonogram, cykl Zimy itp.
const actorName = (entry: OperationEntry) => entry.actor.name
  ?? (entry.actor.type === 'system' ? 'System' : entry.actor.type === 'controller' ? 'Sterownik' : 'Użytkownik');
const matches = (entry: OperationEntry, filter: Filter) =>
  filter === 'all' || (filter === 'system' ? entry.actor.type === 'system' : entry.actor.type !== 'system');

// wpis warunkowy (np. cykl Zimy): bez godziny, status „czeka na warunek”; po wykonaniu jest w wykonanych z godziną
const when = (entry: OperationEntry) => (entry.conditional ? '—' : time(entry.at));
const statusText = (entry: OperationEntry) => {
  if (entry.conditional && entry.status === 'planned') return 'czeka na warunek';
  const status = STATUS[entry.status];
  return (entry.status === 'done' || entry.status === 'delivered') && entry.statusAt ? `${status.text} ${time(entry.statusAt, true)}` : status.text;
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
          {entry.error && <span className="tl-error"> Błąd: {entry.error}</span>}
          {entry.reason && <> {entry.reason}</>}
          {entry.conditions && <small className="tl-cond">Warunki: {entry.conditions}</small>}
        </span>
        <span className={`tl-state chip ${STATUS[entry.status].className}`}>{statusText(entry)}</span>
      </li>
    ))}
  </ol>
);

export const OperationsPage: React.FC = () => {
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
  const count = (n: number) => `${n} ${n === 1 ? 'zdarzenie' : n >= 2 && n <= 4 ? 'zdarzenia' : 'zdarzeń'}`;

  return (
    <div className="page operations-page">
      <div className="filters">
        <div className="date-nav">
          <IconButton label="Poprzedni dzień" icon={<PrevIcon />} disabled={date <= minDate} onClick={() => setDate(shiftDate(date, -1))} />
          <label className="date-cur">
            {dateLabel(date)}{date === today && <small>dziś</small>}
            <input type="date" value={date} min={minDate} max={today} aria-label="Dzień"
              onClick={(event) => event.currentTarget.showPicker?.()}
              onChange={(event) => event.currentTarget.value && setDate(event.currentTarget.value)} />
          </label>
          <IconButton label="Następny dzień" icon={<NextIcon />} disabled={date >= today} onClick={() => setDate(shiftDate(date, 1))} />
        </div>
        <div className="segmented seg-inline" role="radiogroup" aria-label="Źródło">
          {FILTERS.map((item) => (
            <label key={item.key} className="seg">
              <input type="radio" name="op-src" checked={filter === item.key} onChange={() => setFilter(item.key)} />
              <span>{item.label}</span>
            </label>
          ))}
        </div>
      </div>

      {day?.today && (
        <section className="card">
          <header className="card-head"><h2>Zaplanowane</h2><span className="card-hint">od teraz do końca dnia</span></header>
          {planned.length ? <Timeline entries={planned} planned /> : <p className="help">Nic nie czeka.</p>}
        </section>
      )}

      <section className="card">
        <header className="card-head">
          <h2>Operacje w dniu</h2>
          {day && <span className="card-hint">{done.length ? `${count(done.length)} · najnowsze u góry` : 'brak'}</span>}
        </header>
        {day === undefined && <p className="help">Wczytywanie…</p>}
        {day === null && <div className="alert alert-err" role="alert"><div><strong>Nie udało się wczytać dziennika.</strong></div></div>}
        {day && done.length === 0 && <p className="help">Brak operacji w tym dniu.</p>}
        {day && done.length > 0 && <Timeline entries={done} />}
      </section>
    </div>
  );
};
