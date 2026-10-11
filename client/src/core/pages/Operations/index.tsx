// Zakładka „Operacje” (/operations): dziennik operacji wybranego sterownika z dnia (GET /api/operations?date=).
// „Zaplanowane” (tylko dziś): zlecenia w toku i przejścia harmonogramu do końca doby; „Wykonane”: reszta dnia,
// najnowsze u góry. Przy każdej operacji: godzina, kto (użytkownik albo system) i skąd, co, status oraz dlaczego
// i przy jakich warunkach. Filtr Wszystkie / Użytkownik / System, dzień strzałkami ‹ › albo z kalendarza (dziennik
// trzyma 5 dni). Dziś odświeżanie co 30 s i po komunikacie WebSocket „update”. Na telefonie karty, na komputerze tabela.
import { useCallback, useEffect, useState } from 'react';
import { OperationRequests } from '../../api';
import { getSelectedDevice } from '../../context/DeviceContext';
import { wsAddressServer } from '../../http';
import { OperationEntry, OperationStatus, OperationsDay } from '../../types';
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

const STATUS: Record<OperationStatus, { text: string; className: string }> = {
  planned: { text: 'Zaplanowana', className: 'op-chip-planned' },
  pending: { text: 'Czeka na sterownik', className: 'op-chip-wait' },
  sent: { text: 'Wysłana do sterownika', className: 'op-chip-sent' },
  // odebrana przez sterownik, który nie potwierdza wykonania (pompa ciepła, hydrofor): status końcowy
  delivered: { text: 'Dostarczona', className: 'op-chip-ok' },
  done: { text: 'Wykonana', className: 'op-chip-ok' },
  error: { text: 'Błąd', className: 'op-chip-err' },
  replaced: { text: 'Zastąpiona', className: 'op-chip-gone' },
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

const statusText = (entry: OperationEntry) => {
  const status = STATUS[entry.status];
  return (entry.status === 'done' || entry.status === 'delivered') && entry.statusAt ? `${status.text} ${time(entry.statusAt, true)}` : status.text;
};

const PersonIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
  </svg>
);
const SystemIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="6" width="16" height="12" rx="2" /><path d="M9 12h6M12 3v3M8 21h8" />
  </svg>
);

// Dlaczego i warunki; przy błędzie najpierw przyczyna błędu
const Why: React.FC<{ entry: OperationEntry }> = ({ entry }) => (
  <>
    {entry.error && <span className="op-error"><b>Błąd:</b> {entry.error} </span>}
    {entry.reason && <span><b>Dlaczego:</b> {entry.reason} </span>}
    {entry.conditions && <span><b>Warunki:</b> {entry.conditions}</span>}
  </>
);

const Who: React.FC<{ entry: OperationEntry }> = ({ entry }) => (
  <span className="op-who">
    {entry.actor.type === 'system' ? <SystemIcon /> : <PersonIcon />}
    <span>{actorName(entry)} · {entry.source}</span>
  </span>
);

const Chip: React.FC<{ entry: OperationEntry }> = ({ entry }) => (
  <span className={`op-chip ${STATUS[entry.status].className}`}>{statusText(entry)}</span>
);

const key = (entry: OperationEntry, index: number) => entry.id ?? `${entry.at}-${index}`;

const Cards: React.FC<{ entries: OperationEntry[]; planned?: boolean }> = ({ entries, planned }) => (
  <div className="op-cards">
    {entries.map((entry, index) => (
      <div key={key(entry, index)} className={`op-card${planned && entry.status === 'planned' ? ' op-card-planned' : ''}`}>
        <div className="op-card-top">
          <span className="op-time">{time(entry.at)}</span>
          <Chip entry={entry} />
        </div>
        <div className="op-what">{entry.action}</div>
        <Who entry={entry} />
        {(entry.reason || entry.conditions || entry.error) && <div className="op-why"><Why entry={entry} /></div>}
      </div>
    ))}
  </div>
);

const Rows: React.FC<{ title: string; entries: OperationEntry[]; planned?: boolean }> = ({ title, entries, planned }) => (
  <>
    <tr className="op-group"><td colSpan={5}>{title}</td></tr>
    {entries.map((entry, index) => (
      <tr key={key(entry, index)} className={planned && entry.status === 'planned' ? 'op-row-planned' : ''}>
        <td className="op-time">{time(entry.at)}</td>
        <td><Who entry={entry} /></td>
        <td className="op-what">{entry.action}</td>
        <td><Chip entry={entry} /></td>
        <td className="op-why"><Why entry={entry} /></td>
      </tr>
    ))}
  </>
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
  const empty = day && planned.length === 0 && done.length === 0;

  return (
    <div className="settings operations-page">
      <h2>Operacje</h2>
      <section>
        <div className="resource">
          <div className="op-toolbar">
            <div className="op-day">
              <button type="button" aria-label="Poprzedni dzień" disabled={date <= minDate} onClick={() => setDate(shiftDate(date, -1))}>‹</button>
              <label className="op-date">
                <span>{dateLabel(date)}{date === today ? ' (dziś)' : ''}</span>
                <input type="date" value={date} min={minDate} max={today} aria-label="Dzień"
                  onClick={(event) => event.currentTarget.showPicker?.()}
                  onChange={(event) => event.currentTarget.value && setDate(event.currentTarget.value)} />
              </label>
              <button type="button" aria-label="Następny dzień" disabled={date >= today} onClick={() => setDate(shiftDate(date, 1))}>›</button>
            </div>
            <div className="op-filter" role="group" aria-label="Kto">
              {FILTERS.map((item) => (
                <button key={item.key} type="button" className={filter === item.key ? 'op-filter-active' : ''}
                  aria-pressed={filter === item.key} onClick={() => setFilter(item.key)}>{item.label}</button>
              ))}
            </div>
          </div>

          {day === undefined && <div>Wczytywanie…</div>}
          {day === null && <div className="op-error">Nie udało się wczytać dziennika.</div>}
          {empty && <div>Brak operacji w tym dniu.</div>}

          {day && !empty && (
            <>
              <div className="op-mobile">
                {day.today && (
                  <>
                    <div className="op-section">Zaplanowane <small>od teraz do końca dnia</small></div>
                    {planned.length ? <Cards entries={planned} planned /> : <div className="op-none">Nic nie czeka.</div>}
                  </>
                )}
                <div className="op-section">Wykonane <small>najnowsze u góry</small></div>
                {done.length ? <Cards entries={done} /> : <div className="op-none">Brak.</div>}
              </div>

              <table className="op-table">
                <thead>
                  <tr><th>Godzina</th><th>Kto</th><th>Operacja</th><th>Status</th><th>Dlaczego i warunki</th></tr>
                </thead>
                <tbody>
                  {day.today && <Rows title={planned.length ? 'Zaplanowane' : 'Zaplanowane — nic nie czeka'} entries={planned} planned />}
                  <Rows title={done.length ? 'Wykonane' : 'Wykonane — brak'} entries={done} />
                </tbody>
              </table>
            </>
          )}
        </div>
      </section>
    </div>
  );
};
