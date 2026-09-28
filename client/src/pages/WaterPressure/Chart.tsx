import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { WaterRequests } from '../../devices/water-pressure/api';
import { WaterMeterSummary, WaterSummary, WaterSummaryPeriod } from '../../devices/water-pressure/types';
import { formatLiters, todayWarsaw } from '../../utils/water';
import './style.css';

const MONTHS = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
const MONTH_NAMES = [
  'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
  'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień',
];

const PERIODS: { value: WaterSummaryPeriod; label: string }[] = [
  { value: 'day', label: 'Dzień' },
  { value: 'month', label: 'Miesiąc' },
  { value: 'year', label: 'Rok' },
];

// oś Y w jednej jednostce: m³, gdy największa wartość ma co najmniej 10 000 l
// (etykiety w litrach nie mieszczą się wtedy na telefonie)
const axisFormatter = (maxLiters: number) => (value: number) =>
  maxLiters >= 10000
    ? `${(value / 1000).toLocaleString('pl-PL', { maximumFractionDigits: 1 })} m³`
    : `${value.toLocaleString('pl-PL')} l`;

const bucketLabel =(period: WaterSummaryPeriod, key: number) =>
  period === 'day' ? `${key}:00` : period === 'month' ? String(key) : MONTHS[key - 1];

// Wykres wody hydroforu: dzień w godzinach, miesiąc w dniach, rok w miesiącach.
// Rok może pokazać obok szacunku zużycie z odczytów wodomierza.
export const WaterChart: React.FC = () => {
  const [period, setPeriod] = useState<WaterSummaryPeriod>('day');
  const [date, setDate] = useState(todayWarsaw());
  const [summary, setSummary] = useState<WaterSummary | null>(null);
  const [showMeter, setShowMeter] = useState(false);
  const [meter, setMeter] = useState<WaterMeterSummary | null>(null);
  const meterWanted = period === 'year' && showMeter;
  const year = Number(date.slice(0, 4));

  useEffect(() => {
    // serwer dostaje pełną datę; dla miesiąca i roku liczy się tylko jej początek
    const query = period === 'day' ? date : period === 'month' ? `${date.slice(0, 7)}-01` : `${date.slice(0, 4)}-01-01`;
    setSummary(null);
    WaterRequests.getSummary(period, query).then(setSummary);
  }, [period, date]);

  useEffect(() => {
    if (!meterWanted) return;
    setMeter(null);
    WaterRequests.getMeterSummary(year).then((result) => setMeter(result ?? { year, periods: [], months: [], suggestedK: null }));
  }, [meterWanted, year]);

  const data = (summary?.buckets ?? []).map((bucket) => ({
    label: bucketLabel(period, bucket.key),
    // podpowiedź: w roku pełna nazwa miesiąca
    tooltipLabel: period === 'year' ? `${MONTH_NAMES[bucket.key - 1]} ${year}` : bucketLabel(period, bucket.key),
    woda: bucket.waterLiters,
    runs: bucket.runs,
  }));
  const total = data.reduce((sum, item) => sum + item.woda, 0);
  const runs = data.reduce((sum, item) => sum + item.runs, 0);

  const meterData = (meter?.months ?? []).map((item) => ({
    month: MONTHS[item.month - 1],
    monthName: `${MONTH_NAMES[item.month - 1]} ${year}`,
    wodomierz: item.meterLiters,
    szacunek: item.estimatedLiters,
  }));
  const meterReady = (meter?.periods.length ?? 0) > 0;
  // bez odczytów do porównania zostaje zwykły wykres zużycia
  const meterMode = meterWanted && meterReady;

  return (
    <div className="settings water-page">
      <h2>Zużycie wody w okresie</h2>
      <section>
        <div className="resource">
          <div className="water-toolbar">
            <div className="water-periods" role="radiogroup" aria-label="Okres">
              {PERIODS.map((item) => (
                <label key={item.value}>
                  <input type="radio" name="water-period" value={item.value}
                    checked={period === item.value} onChange={() => setPeriod(item.value)} />
                  {item.label}
                </label>
              ))}
            </div>
            {period === 'day' && (
              <input type="date" value={date} onChange={(event) => event.currentTarget.value && setDate(event.currentTarget.value)} />
            )}
            {period === 'month' && (
              <input type="month" value={date.slice(0, 7)}
                onChange={(event) => event.currentTarget.value && setDate(`${event.currentTarget.value}-01`)} />
            )}
            {period === 'year' && (
              <input type="number" min={2020} max={2100} value={date.slice(0, 4)}
                onChange={(event) => event.currentTarget.value.length === 4 && setDate(`${event.currentTarget.value}-01-01`)} />
            )}
          </div>

          {meterMode ? (
            <>
              <div className="water-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={meterData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" interval="preserveStartEnd" />
                      <YAxis width={70} tickFormatter={axisFormatter(Math.max(0, ...meterData.flatMap((item) => [item.wodomierz ?? 0, item.szacunek ?? 0])))} />
                      <Tooltip
                        formatter={(item) => `${formatLiters(Number(item))} l`}
                        labelFormatter={(label, payload) => payload?.[0]?.payload?.monthName ?? label}
                      />
                      <Legend />
                      <Bar dataKey="wodomierz" fill="#1481a5" />
                      <Bar dataKey="szacunek" fill="#9bbfcc" />
                    </BarChart>
                  </ResponsiveContainer>
              </div>
              {meter?.suggestedK !== null && meter?.suggestedK !== undefined && (
                <div className="water-hint">
                  Sugerowany współczynnik k zbiornika z poduszką: <strong>{meter.suggestedK.toLocaleString('pl-PL')}</strong> (wpisz w Ustawieniach).
                </div>
              )}
            </>
          ) : (
            <>
              <div className="water-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" interval="preserveStartEnd" />
                    <YAxis width={70} tickFormatter={axisFormatter(Math.max(0, ...data.map((item) => item.woda)))} />
                    <Tooltip
                      formatter={(value, _name, item) =>
                        [`${formatLiters(Number(value))} l (${item.payload.runs} uruch.)`, 'Woda']}
                      labelFormatter={(label, payload) => payload?.[0]?.payload?.tooltipLabel ?? label}
                    />
                    <Bar dataKey="woda" fill="#1481a5" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="water-total">
                {summary === null ? 'Wczytywanie…' : <>Razem: <strong>{formatLiters(total)} l</strong> w {runs} uruchomieniach</>}
              </div>
            </>
          )}
          {period === 'year' && (
            <label className="water-check water-check-bottom">
              <input type="checkbox" checked={showMeter} onChange={(event) => setShowMeter(event.currentTarget.checked)} />
              Pokaż odczyty z wodomierza
            </label>
          )}
          {meterWanted && meter !== null && !meterReady && (
            <div className="water-hint">Brak odczytów wodomierza do porównania w tym roku (potrzebne są co najmniej dwa).</div>
          )}
        </div>
      </section>
    </div>
  );
};
