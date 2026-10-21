// Zakładka Wykres hydroforu (/chart) w układzie makiety „Instrument” (#s-tank-wykres): okres Dzień / Miesiąc / Rok
// i nawigacja po dacie w pasku filtrów, kafelki statystyk (woda, pompa, uruchomień, przepływ) i słupki wody
// z GET /water-pressure-tank/summary (czas pompy × przepływ z wodomierza; bez przepływu słupki czasu pracy pompy).
// W widoku Rok znacznik „Pokaż odczyty z wodomierza” zestawia wodomierz z wodą z czasu pompy
// (GET /water-pressure-tank/meter/summary). Dane pobierane przy zmianie okresu lub daty, bez odświeżania cyklicznego.
import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { cc, tooltipStyle } from '../../../core/chartColors';
import { WaterPressureTankRequests } from '../api';
import { WaterMeterSummary, WaterSummary, WaterSummaryPeriod } from '../types';
import { dayLabel, formatDuration, formatLiters, monthLabel, shiftDay, shiftMonth, todayWarsaw } from '../utils/water';
import { DateNav } from '../components/DateNav';
import { DurationValue } from '../components/DurationValue';
import { getLang, locale, t as tr, useLang } from '../../../core/i18n';
import './style.css';

// nazwy miesięcy w języku aplikacji (skrót na osi, pełna w podpowiedzi)
const monthOf = (month: number, style: 'short' | 'long') => new Date(2026, month - 1, 1).toLocaleDateString(locale(getLang()), { month: style });
const MONTHS_OF = (month: number) => monthOf(month, 'short').replace('.', '');
const MONTH_NAME_OF = (month: number) => { const name = monthOf(month, 'long'); return name.charAt(0).toUpperCase() + name.slice(1); };

const periods = (): { value: WaterSummaryPeriod; label: string; unit: string; title: string }[] => [
  { value: 'day', label: tr('period.day'), unit: tr('common.dayUnit'), title: tr('wt.chart.hours') },
  { value: 'month', label: tr('period.month'), unit: tr('common.monthUnit'), title: tr('wt.chart.days') },
  { value: 'year', label: tr('period.year'), unit: tr('common.yearUnit'), title: tr('wt.chart.months') },
];

// oś Y w jednej jednostce: m³, gdy największa wartość ma co najmniej 10 000 l
// (etykiety w litrach nie mieszczą się wtedy na telefonie)
const axisFormatter = (maxLiters: number) => (value: number) =>
  maxLiters >= 10000
    ? `${(value / 1000).toLocaleString(locale(getLang()), { maximumFractionDigits: 1 })} m³`
    : `${value.toLocaleString(locale(getLang()))} l`;

const bucketLabel = (period: WaterSummaryPeriod, key: number) =>
  period === 'day' ? `${key}:00` : period === 'month' ? String(key) : MONTHS_OF(key);

const axisProps = () => ({ tick: { fill: cc().axis, fontSize: 11 }, stroke: cc().line, tickLine: false });

// Wykres wody hydroforu: dzień w godzinach, miesiąc w dniach, rok w miesiącach.
// Rok może pokazać obok szacunku zużycie z odczytów wodomierza.
export const WaterPressureTankChart: React.FC = () => {
  const { t, locale: loc } = useLang();
  const PERIODS = periods();
  const [period, setPeriod] = useState<WaterSummaryPeriod>('month');
  const [date, setDate] = useState(todayWarsaw());
  const [summary, setSummary] = useState<WaterSummary | null>(null);
  const [showMeter, setShowMeter] = useState(false);
  const [meter, setMeter] = useState<WaterMeterSummary | null>(null);
  const meterWanted = period === 'year' && showMeter;
  const year = Number(date.slice(0, 4));
  const today = todayWarsaw();
  const periodInfo = PERIODS.find((item) => item.value === period)!;

  useEffect(() => {
    // serwer dostaje pełną datę; dla miesiąca i roku liczy się tylko jej początek
    const query = period === 'day' ? date : period === 'month' ? `${date.slice(0, 7)}-01` : `${date.slice(0, 4)}-01-01`;
    setSummary(null);
    WaterPressureTankRequests.getSummary(period, query).then(setSummary);
  }, [period, date]);

  useEffect(() => {
    if (!meterWanted) return;
    setMeter(null);
    WaterPressureTankRequests.getMeterSummary(year).then((result) => setMeter(result ?? {
      year, periods: [], months: [], flow: { litersPerMinute: null, periods: 0, meterLiters: 0, pumpSeconds: 0 },
    }));
  }, [meterWanted, year]);

  // nawigacja po dacie: krok w jednostce okresu; w przód najdalej do dziś
  const shift = (n: number) => setDate(
    period === 'day' ? shiftDay(date, n) : period === 'month' ? `${shiftMonth(date.slice(0, 7), n)}-01` : `${year + n}-01-01`,
  );
  const atToday = period === 'day' ? date >= today : period === 'month' ? date.slice(0, 7) >= today.slice(0, 7) : year >= Number(today.slice(0, 4));
  const navLabel = period === 'day' ? dayLabel(date) : period === 'month' ? monthLabel(date.slice(0, 7)) : String(year);

  // etykiety osi X jak w makiecie: miesiąc 1 · 8 · 16 · 24 · ostatni dzień, dzień co 6 godzin, rok wszystkie miesiące
  const bucketCount = summary?.buckets.length ?? 0;
  const xTicks = period === 'month' ? ['1', '8', '16', '24', String(bucketCount)] : period === 'day' ? ['0:00', '6:00', '12:00', '18:00', '23:00'] : undefined;

  const hasFlow = summary?.flow?.litersPerMinute !== null && summary?.flow?.litersPerMinute !== undefined;
  const data = (summary?.buckets ?? []).map((bucket) => ({
    label: bucketLabel(period, bucket.key),
    // podpowiedź: w roku pełna nazwa miesiąca
    tooltipLabel: period === 'year' ? `${MONTH_NAME_OF(bucket.key)} ${year}` : bucketLabel(period, bucket.key),
    // bez przepływu słupki pokazują czas pracy pompy w minutach
    woda: hasFlow ? bucket.waterLiters ?? 0 : Math.round(bucket.pumpSeconds / 6) / 10,
    pumpSeconds: bucket.pumpSeconds,
    runs: bucket.runs,
  }));
  const total = data.reduce((sum, item) => sum + item.woda, 0);
  const totalSeconds = data.reduce((sum, item) => sum + item.pumpSeconds, 0);
  const runs = data.reduce((sum, item) => sum + item.runs, 0);

  const meterData = (meter?.months ?? []).map((item) => ({
    month: MONTHS_OF(item.month),
    monthName: `${MONTH_NAME_OF(item.month)} ${year}`,
    [t('wt.chart.meterSeries')]: item.meterLiters,
    [t('wt.chart.estimatedSeries')]: item.estimatedLiters,
  }));
  const meterReady = (meter?.periods.length ?? 0) > 0;
  // bez odczytów do porównania zostaje zwykły wykres zużycia
  const meterMode = meterWanted && meterReady;

  return (
    <main className="page page-device tank-page">
      <div className="filters">
        <div className="segmented seg-inline" role="radiogroup" aria-label={t('period.label')}>
          {PERIODS.map((item) => (
            <label key={item.value} className="seg">
              <input type="radio" name="tank-period" value={item.value} checked={period === item.value} onChange={() => setPeriod(item.value)} />
              <span>{item.label}</span>
            </label>
          ))}
        </div>
        <DateNav label={navLabel} unit={periodInfo.unit} onPrev={() => shift(-1)} onNext={() => shift(1)} nextDisabled={atToday} />
      </div>

      <div className="stat-row">
        <div className="stat">
          <span className="stat-label">{t('tile.icon.drop')}</span>
          <span className="stat-value">{summary === null ? '…' : hasFlow ? <>{formatLiters(Math.round(total))}<small>l</small></> : '—'}</span>
        </div>
        <div className="stat">
          <span className="stat-label">{t('tile.icon.timer')}</span>
          <span className="stat-value">{summary === null ? '…' : <DurationValue seconds={totalSeconds} />}</span>
        </div>
        <div className="stat">
          <span className="stat-label">{t('tile.icon.repeat')}</span>
          <span className="stat-value">{summary === null ? '…' : runs}</span>
        </div>
        <div className="stat">
          <span className="stat-label">{t('wt.flow')}</span>
          <span className="stat-value">{summary === null ? '…' : hasFlow ? <>{formatLiters(Math.round(summary!.flow.litersPerMinute!))}<small>l/min</small></> : '—'}</span>
        </div>
      </div>

      <section className="card">
        <header className="card-head">
          <h2>{meterMode ? t('wt.chart.meterTitle') : hasFlow || summary === null ? periodInfo.title : t('wt.chart.pumpTime')}</h2>
          <span className="card-hint">{meterMode ? t('wt.chart.litersInMonths') : hasFlow ? t('wt.chart.litersHover') : t('wt.chart.minutesHover')}</span>
        </header>
        <div className="chart chart-lg">
          <ResponsiveContainer width="100%" height="100%">
            {meterMode ? (
              <BarChart data={meterData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={cc().grid} vertical={false} />
                <XAxis {...axisProps()} dataKey="month" interval="preserveStartEnd" />
                <YAxis {...axisProps()} axisLine={false} width={56} tickFormatter={axisFormatter(Math.max(0, ...meterData.flatMap((item) => [Number(item[t('wt.chart.meterSeries')]) || 0, Number(item[t('wt.chart.estimatedSeries')]) || 0])))} />
                <Tooltip {...tooltipStyle()} cursor={{ fill: cc().grid }}
                  formatter={(item) => `${formatLiters(Number(item))} l`}
                  labelFormatter={(label, payload) => payload?.[0]?.payload?.monthName ?? label} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey={t('wt.chart.meterSeries')} fill={cc().water} radius={[2, 2, 0, 0]} />
                <Bar dataKey={t('wt.chart.estimatedSeries')} fill={cc().muted} radius={[2, 2, 0, 0]} />
              </BarChart>
            ) : (
              <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={cc().grid} vertical={false} />
                <XAxis {...axisProps()} dataKey="label" ticks={xTicks} interval={xTicks ? 0 : "preserveStartEnd"} />
                <YAxis {...axisProps()} axisLine={false} width={56} tickFormatter={hasFlow
                  ? axisFormatter(Math.max(0, ...data.map((item) => item.woda)))
                  : (value: number) => `${value.toLocaleString(loc)} min`} />
                <Tooltip {...tooltipStyle()} cursor={{ fill: cc().grid }}
                  formatter={(value, _name, item) => hasFlow
                    ? [`${formatLiters(Number(value))} l, ${t('tank.pump')} ${formatDuration(item.payload.pumpSeconds)} (${item.payload.runs} ${t('wt.runsAbbr')})`, t('tile.icon.drop')]
                    : [`${formatDuration(item.payload.pumpSeconds)} (${item.payload.runs} ${t('wt.runsAbbr')})`, t('tile.icon.timer')]}
                  labelFormatter={(label, payload) => payload?.[0]?.payload?.tooltipLabel ?? label} />
                <Bar dataKey="woda" fill={cc().water} radius={[2, 2, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
        {period === 'year' && (
          <label className="check">
            <input type="checkbox" checked={showMeter} onChange={(event) => setShowMeter(event.currentTarget.checked)} />
            <span>{t('wt.chart.showMeter')}</span>
            <small>{t('wt.chart.showMeterHint')}{meter?.flow.litersPerMinute != null ? t('wt.chart.withFlow', { flow: formatLiters(meter.flow.litersPerMinute) }) : ''}</small>
          </label>
        )}
        {meterWanted && meter !== null && !meterReady && (
          <p className="help danger-text">{t('wt.chart.noMeterYear')}</p>
        )}
        <p className="help">
          {summary !== null && !hasFlow ? t('wt.chart.helpNoFlow') : t('wt.chart.help')}
        </p>
      </section>
    </main>
  );
};
