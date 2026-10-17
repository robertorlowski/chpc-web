// Widok główny fotowoltaiki (/), układ „Instrument” z makiety (makiety/src/makieta.html, #s-pv-podglad): karta hero
// „Moc teraz” z KPI dziś / miesiąc / łącznie / falownik (temperatura), karta „Moc w ciągu dnia” (krzywa z dnia
// ostatniego odczytu) i karta „Panele”: porty mikrofalowników z paskiem mocy względem szczytu dnia, produkcją dziś
// i chipem stanu (produkuje, słabiej = ponad 15 % poniżej średniej produkcji dnia, bez produkcji, brak łączności,
// alarm). GET /photovoltaic/current i /day, odświeżanie co 60 s; przy nieaktualnym odczycie pasek OfflineBanner.
import { useEffect, useState } from 'react';
import { cc, tooltipStyle } from '../../../core/chartColors';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { OfflineBanner } from '../../../core/components/OfflineBanner';
import { PhotovoltaicRequests } from '../api';
import { PvCurrent, PvDay, PvPanel } from '../types';
import {
  STATE_LABELS, formatDateTime, formatDay, formatEnergy, formatPower, formatTime, plural, shortSerial, splitEnergy, splitPower,
  splitTemp, todayWarsaw, warsawDay,
} from '../utils/pv';
import './style.css';

const REFRESH_MS = 60_000;
// panel „słabiej”: produkcja dziś poniżej 85 % średniej paneli (zacienienie, zabrudzenie, usterka)
const LOW_RATIO = 0.85;

type PanelRow = { panel: PvPanel; low: boolean; belowPct: number };

const Kpi = ({ label, value }: { label: string; value: [string, string] }) => (
  <div className="kpi">
    <span className="kpi-label">{label}</span>
    <span className="kpi-value">{value[0]}{value[1] && <small>{value[1]}</small>}</span>
  </div>
);

const chipFor = ({ panel, low }: PanelRow) => {
  if (panel.state === 'offline' || panel.state === 'alarm') return <span className="chip chip-err">{STATE_LABELS[panel.state]}</span>;
  if (low) return <span className="chip chip-warn">słabiej</span>;
  if (panel.state === 'produces') return <span className="chip chip-ok">{STATE_LABELS.produces}</span>;
  return <span className="chip chip-off">{STATE_LABELS.idle}</span>;
};

export const PhotovoltaicHome: React.FC = () => {
  const [current, setCurrent] = useState<PvCurrent | null | undefined>(undefined);
  const [day, setDay] = useState<PvDay | null>(null);

  // krzywa mocy z dnia ostatniego odczytu (dziś albo — przy braku odczytów — ostatni dzień z danymi)
  useEffect(() => {
    const load = () => PhotovoltaicRequests.getCurrent().then((result) => {
      setCurrent(result);
      const day = result?.readAt ? warsawDay(result.readAt) : todayWarsaw();
      PhotovoltaicRequests.getDay(day).then(setDay);
    });
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  const panels = current?.panels ?? [];
  const inverters = [...new Set(panels.map((panel) => panel.serial))];
  // skala pasków: szczyt paneli w tym dniu (wieczorne 5 W daje wąski pasek, nie pełny)
  const maxPanelPower = Math.max(1, ...panels.map((p) => p.power ?? 0),
    ...(day?.panels ?? []).flatMap((p) => p.points.map((point) => point.power)));
  const withToday = panels.filter((panel) => panel.prod_today !== undefined);
  const averageToday = withToday.length ? withToday.reduce((sum, panel) => sum + (panel.prod_today ?? 0), 0) / withToday.length : 0;
  const rows: PanelRow[] = panels.map((panel) => {
    const today = panel.prod_today ?? 0;
    const low = averageToday > 0 && (panel.state === 'produces' || panel.state === 'idle') && today < averageToday * LOW_RATIO;
    return { panel, low, belowPct: Math.round(100 * (1 - today / (averageToday || 1))) };
  });
  const chartData = (day?.points ?? []).map((p) => ({ label: formatTime(p.t), moc: p.power }));
  const [powerNum, powerUnit] = splitPower(current?.power);
  const note = [
    day?.peakW !== undefined ? `szczyt dnia ${formatPower(day.peakW)} o ${formatTime(day.peakAt)}` : '',
    panels.length ? plural(panels.length, ['panel', 'panele', 'paneli']) : '',
    inverters.length ? `${plural(inverters.length, ['mikrofalownik', 'mikrofalowniki', 'mikrofalowników'])} HMS` : '',
    current?.readAt ? `odczyt ${formatDateTime(current.readAt)}` : '',
  ].filter(Boolean).join(' · ');
  const panelsHint = inverters.length === 1
    ? `mikrofalownik ${shortSerial(inverters[0])} · pasek względem szczytu dnia`
    : `${plural(inverters.length, ['mikrofalownik', 'mikrofalowniki', 'mikrofalowników'])} · pasek względem szczytu dnia`;

  return (
    <div className="page page-device pv-page">
      {current === undefined && <section className="card"><p className="help">Wczytywanie…</p></section>}
      {current === null && <section className="card"><p className="help danger-text">Nie udało się pobrać danych.</p></section>}
      {current && !current.readAt && <section className="card"><p className="help">Brak odczytów z instalacji PV.</p></section>}
      {current?.readAt && (
        <>
          {current.stale && <OfflineBanner since={current.readAt} detail="DTU nie przysłało nowego odczytu." />}
          <section className="hero card card-hero">
            <div className="hero-main">
              <span className="hero-label">Moc teraz</span>
              <div className="hero-value"><span className="hero-num">{powerNum}</span>{powerUnit && <span className="hero-unit">{powerUnit}</span>}</div>
              <span className="hero-note">{note}</span>
            </div>
            <div className="hero-side">
              <div className="hero-kpis">
                <Kpi label="Dziś" value={splitEnergy(current.todayWh)} />
                <Kpi label="Miesiąc" value={splitEnergy(current.monthWh)} />
                <Kpi label="Łącznie" value={splitEnergy(current.totalWh)} />
                <Kpi label="Falownik" value={splitTemp(current.temperature)} />
              </div>
            </div>
          </section>

          <section className="card">
            <header className="card-head">
              <h2>Moc w ciągu dnia</h2>
              {day && <span className="card-hint">odczyty co 5 min · {formatDay(day.date)}</span>}
            </header>
            {chartData.length ? (
              <div className="chart chart-md">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke={cc().grid} vertical={false} />
                    <XAxis dataKey="label" stroke={cc().line} tick={{ fill: cc().axis, fontSize: 11 }} tickLine={false} interval="preserveStartEnd" minTickGap={40} />
                    <YAxis stroke={cc().line} axisLine={false} tickLine={false} width={52} tick={{ fill: cc().axis, fontSize: 11 }} tickFormatter={(value: number) => `${value} W`} />
                    <Tooltip {...tooltipStyle()} formatter={(value) => [formatPower(Number(value)), 'Moc']} />
                    <Area type="monotone" dataKey="moc" stroke={cc().sun} strokeWidth={2} fill={cc().sun} fillOpacity={0.28} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : <p className="help">Brak odczytów z tego dnia.</p>}
          </section>

          <section className="card">
            <header className="card-head">
              <h2>Panele</h2>
              {current.panelsAvailable && <span className="card-hint">{panelsHint}</span>}
            </header>
            {!current.panelsAvailable && <p className="help">Ostatni odczyt nie ma szczegółów paneli.</p>}
            {current.panelsAvailable && (
              <ul className="panels">
                {rows.map((row) => (
                  <li key={row.panel.key} className={row.low ? 'is-low' : undefined}>
                    <span className="panel-name">Port {row.panel.port}</span>
                    <span className="bar" aria-hidden="true">
                      <span style={{ '--p': `${Math.round(100 * (row.panel.power ?? 0) / maxPanelPower)}%` } as React.CSSProperties} />
                    </span>
                    <span className="panel-val">{formatPower(row.panel.power)}</span>
                    <span className="panel-sub">
                      {[
                        inverters.length > 1 ? shortSerial(row.panel.serial) : '',
                        row.panel.prod_today !== undefined ? `${formatEnergy(row.panel.prod_today)} dziś` : '',
                        row.low ? `${row.belowPct} % poniżej średniej` : '',
                      ].filter(Boolean).join(' · ')}
                    </span>
                    {chipFor(row)}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
};
