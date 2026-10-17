// Widok główny hydroforu (/) w układzie makiety „Instrument” (#s-tank-podglad): pasek Offline (sterownik ma
// zasilanie tylko w czasie pracy pompy), hero „Woda dziś” z przełącznikami pompy i kompresora oraz KPI czasu
// kompresora (GET /device/properties) i przepływu (GET /water-pressure-tank/flow), tabela dzisiejszych
// uruchomień i słupki zużycia z 7 dni (GET /water-pressure-tank/runs, grupowane po dniach w przeglądarce)
// oraz suma miesiąca (GET /water-pressure-tank/summary?period=month).
import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { cc, tooltipStyle } from '../../../core/chartColors';
import { DeviceRequests } from '../../../core/api';
import { ageLabel } from '../../../core/components/DeviceTileCard';
import { DeviceProperties } from '../../../core/types';
import { WaterPressureTankRequests } from '../api';
import { WaterFlow, WaterPressureTankRun, WaterSummary } from '../types';
import {
  compressorSeconds, dayWarsaw, formatDuration, formatLiters, formatTime, shiftDay, sumPumpSeconds, sumWater,
  todayWarsaw, weekDayShort,
} from '../utils/water';
import { OfflineIcon } from '../components/TankIcons';
import './style.css';

// Uruchomienia odświeżane co 5 s (sterownik wysyła stan co 1 s, bieżące uruchomienie ma inProgress
// i compressorRunning; kompresor pracuje zwykle 30 s, więc wskaźnik musi nadążać); ustawienia,
// przepływ i suma miesiąca tylko przy wejściu.
const REFRESH_MS = 5_000;
const WEEK_DAYS = 7;

// Przełącznik z makiety (.switch): tylko wskaźnik stanu ze sterownika, bez klikania (is-disabled).
const Switch: React.FC<{ on: boolean; label: string }> = ({ on, label }) => (
  <span className={`switch is-disabled${on ? ' is-on' : ''}`} role="switch" aria-checked={on} aria-disabled="true"
    aria-label={label} />
);

const plural = (count: number, one: string, few: string, many: string) => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (count === 1) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

export const WaterPressureTankHome: React.FC = () => {
  const [properties, setProperties] = useState<DeviceProperties | null>(null);
  const [flow, setFlow] = useState<WaterFlow | null>(null);
  const [month, setMonth] = useState<WaterSummary | null>(null);
  // uruchomienia z 7 dni (dziś i 6 poprzednich): tabela dnia, słupki tygodnia i czas ostatniego uruchomienia
  const [weekRuns, setWeekRuns] = useState<WaterPressureTankRun[] | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    DeviceRequests.getDeviceProperties().then((result) => setProperties(result ?? {}));
    WaterPressureTankRequests.getFlow().then((result) => result && setFlow(result));
    WaterPressureTankRequests.getSummary('month', todayWarsaw()).then((result) => result && setMonth(result));
    const load = () => {
      const today = todayWarsaw();
      WaterPressureTankRequests.getRuns(shiftDay(today, -(WEEK_DAYS - 1)), today).then((result) => {
        if (result) setWeekRuns(result);
        setNow(Date.now());
      });
    };
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  const today = todayWarsaw();
  const runs = (weekRuns ?? []).filter((run) => dayWarsaw(run.pumpStart) === today);
  const sortedRuns = [...runs].reverse();
  // stan teraz z najnowszego uruchomienia (sterownik ma zasilanie tylko w czasie pracy pompy)
  const current = sortedRuns.find((run) => run.inProgress);
  const lastRun = weekRuns?.length ? weekRuns[weekRuns.length - 1] : undefined;
  const hasFlow = flow?.litersPerMinute !== null && flow?.litersPerMinute !== undefined;

  const water = sumWater(runs);
  const pumpSeconds = sumPumpSeconds(runs);
  const monthLiters = month?.buckets.some((bucket) => bucket.waterLiters !== null)
    ? month.buckets.reduce((sum, bucket) => sum + (bucket.waterLiters ?? 0), 0)
    : null;

  // słupki tygodnia: dzień po dniu od najstarszego; bez przepływu minuty pracy pompy
  const week = Array.from({ length: WEEK_DAYS }, (_, index) => shiftDay(today, index - (WEEK_DAYS - 1))).map((day) => {
    const dayRuns = (weekRuns ?? []).filter((run) => dayWarsaw(run.pumpStart) === day);
    const seconds = sumPumpSeconds(dayRuns);
    return {
      day: weekDayShort(day),
      date: day,
      value: hasFlow ? Math.round(sumWater(dayRuns) ?? 0) : Math.round(seconds / 6) / 10,
      pumpSeconds: seconds,
      runs: dayRuns.length,
    };
  });

  return (
    <main className="page page-device tank-page">
      {weekRuns !== null && !current && (
        <div className="banner banner-off" role="status">
          <OfflineIcon />
          <div>
            <strong>Offline{lastRun ? ` od ${ageLabel(Math.max(0, now - new Date(lastRun.pumpEnd).getTime()))}` : ''}</strong>
            <span>
              sterownik ma zasilanie tylko w czasie pracy pompy;
              {lastRun ? ` ostatnie uruchomienie ${dayWarsaw(lastRun.pumpStart) === today ? '' : `${weekDayShort(dayWarsaw(lastRun.pumpStart))} `}${formatTime(lastRun.pumpStart).slice(0, 5)}.` : ` brak uruchomień od ${WEEK_DAYS} dni.`}
            </span>
          </div>
        </div>
      )}

      <section className="hero card card-hero">
        <div className="hero-main">
          <span className="hero-label">{hasFlow ? 'Woda dziś' : 'Pompa dziś'}</span>
          <div className="hero-value">
            {hasFlow
              ? <><span className="hero-num">{water === null ? '0' : formatLiters(Math.round(water))}</span><span className="hero-unit">l</span></>
              : <span className="hero-num tank-hero-text">{formatDuration(pumpSeconds)}</span>}
          </div>
          <span className="hero-note">
            {runs.length} {plural(runs.length, 'uruchomienie', 'uruchomienia', 'uruchomień')} · pompa {formatDuration(pumpSeconds)}
            {hasFlow && monthLiters !== null && <> · {formatLiters(Math.round(monthLiters))} l w tym miesiącu</>}
            {!hasFlow && <> · woda po dwóch odczytach wodomierza</>}
          </span>
        </div>
        <div className="hero-side">
          <ul className="toggle-list toggle-hero">
            <li><span className="t-name">Pompa wody</span><Switch on={!!current} label="Pompa wody" /></li>
            <li><span className="t-name">Kompresor powietrza</span><Switch on={!!current?.compressorRunning} label="Kompresor" /></li>
          </ul>
          <div className="hero-kpis">
            <div className="kpi">
              <span className="kpi-label">Czas kompresora</span>
              <span className="kpi-value">{properties?.compressor_seconds ?? '—'}<small>s</small></span>
            </div>
            <div className="kpi">
              <span className="kpi-label">Przepływ</span>
              <span className="kpi-value">{hasFlow ? formatLiters(Math.round(flow!.litersPerMinute!)) : '—'}<small>l/min</small></span>
            </div>
          </div>
        </div>
      </section>

      <section className="card card-table">
        <header className="card-head">
          <h2>Dzisiejsze uruchomienia</h2>
          {runs.length > 0 && (
            <span className="card-hint">{hasFlow ? `razem ${formatLiters(Math.round(water ?? 0))} l` : `pompa ${formatDuration(pumpSeconds)}`}</span>
          )}
        </header>
        {weekRuns === null && <p className="help">Wczytywanie…</p>}
        {weekRuns !== null && runs.length === 0 && <p className="help">Dziś pompa jeszcze nie pracowała.</p>}
        {sortedRuns.length > 0 && (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Godzina</th><th className="num">Kompresor</th><th className="num">Pompa</th><th className="num">Woda</th></tr></thead>
              <tbody>
                {sortedRuns.map((run) => (
                  <tr key={run._id}>
                    <td title={run.timeApproximate ? 'Czas przybliżony: uruchomienie bez sieci' : undefined}>
                      {run.timeApproximate ? '≈ ' : ''}{formatTime(run.pumpStart)}
                    </td>
                    <td className="num">
                      {run.compressorRunning ? <em>pracuje</em> : compressorSeconds(run) !== undefined ? `${compressorSeconds(run)} s` : run.inProgress ? <em>pracuje</em> : '—'}
                    </td>
                    <td className="num" title={run.manualSeconds ? `Bez ${run.manualSeconds} s ręcznej pracy kompresora` : undefined}>
                      {run.inProgress ? <em>{formatDuration(run.pumpSeconds)} …</em> : formatDuration(run.pumpSeconds)}
                    </td>
                    <td className="num">{run.waterLiters === null ? '—' : `${formatLiters(Math.round(run.waterLiters))} l`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <header className="card-head">
          <h2>Zużycie w tygodniu</h2>
          <span className="card-hint">{hasFlow ? 'litry na dzień' : 'minuty pracy pompy na dzień'}</span>
        </header>
        <div className="chart chart-md">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={week} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={cc().grid} vertical={false} />
              <XAxis dataKey="day" interval={0} tick={{ fill: cc().axis, fontSize: 11 }} stroke={cc().line} tickLine={false} />
              <YAxis tick={{ fill: cc().axis, fontSize: 11 }} stroke={cc().line} tickLine={false} axisLine={false} width={44}
                tickFormatter={(value: number) => `${value.toLocaleString('pl-PL')} ${hasFlow ? 'l' : 'min'}`} />
              <Tooltip {...tooltipStyle()} cursor={{ fill: cc().grid }}
                formatter={(value, _name, item) => hasFlow
                  ? [`${formatLiters(Number(value))} l, pompa ${formatDuration(item.payload.pumpSeconds)} (${item.payload.runs} uruch.)`, 'Woda']
                  : [`${formatDuration(item.payload.pumpSeconds)} (${item.payload.runs} uruch.)`, 'Pompa']}
                labelFormatter={(label, payload) => payload?.[0]?.payload?.date ?? label} />
              <Bar dataKey="value" fill={cc().water} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </main>
  );
};
