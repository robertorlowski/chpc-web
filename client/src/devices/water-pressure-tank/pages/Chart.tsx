// Zakładka Wykres hydroforu (/chart): słupki wody z GET /water-pressure-tank/summary (czas pompy
// × przepływ z wodomierza; bez przepływu słupki czasu pracy pompy), a w widoku Rok opcjonalnie
// porównanie z wodomierzem (GET /water-pressure-tank/meter/summary).
// Dane pobierane przy zmianie okresu lub daty, bez odświeżania cyklicznego.
import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useFillHeight } from '../../../core/components/useFillHeight';
import { WaterPressureTankRequests } from '../api';
import { WaterMeterSummary, WaterSummary, WaterSummaryPeriod } from '../types';
import { formatDuration, formatLiters, todayWarsaw } from '../utils/water';
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
export const WaterPressureTankChart: React.FC = () => {
  // karta na całe okno: wykres wypełnia miejsce między wyborem okresu a podsumowaniem (useFillHeight)
  const cardRef = useFillHeight<HTMLDivElement>(360);
  const [period, setPeriod] = useState<WaterSummaryPeriod>('day');
  const [date, setDate] = useState(todayWarsaw());
  // rok wpisywany w polu (tekst): dawniej pole trzymało rok z daty i zmianę przyjmowało tylko przy 4 cyfrach,
  // więc nie dało się skasować cyfry i wpisać nowego roku (2026-10-05); null = rok z wybranej daty
  const [yearText, setYearText] = useState<string | null>(null);
  const [summary, setSummary] = useState<WaterSummary | null>(null);
  const [showMeter, setShowMeter] = useState(false);
  const [meter, setMeter] = useState<WaterMeterSummary | null>(null);
  const meterWanted = period === 'year' && showMeter;
  const year = Number(date.slice(0, 4));

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

  const hasFlow = summary?.flow?.litersPerMinute !== null && summary?.flow?.litersPerMinute !== undefined;
  const data = (summary?.buckets ?? []).map((bucket) => ({
    label: bucketLabel(period, bucket.key),
    // podpowiedź: w roku pełna nazwa miesiąca
    tooltipLabel: period === 'year' ? `${MONTH_NAMES[bucket.key - 1]} ${year}` : bucketLabel(period, bucket.key),
    // bez przepływu słupki pokazują czas pracy pompy w minutach
    woda: hasFlow ? bucket.waterLiters ?? 0 : Math.round(bucket.pumpSeconds / 6) / 10,
    pumpSeconds: bucket.pumpSeconds,
    runs: bucket.runs,
  }));
  const total = data.reduce((sum, item) => sum + item.woda, 0);
  const totalSeconds = data.reduce((sum, item) => sum + item.pumpSeconds, 0);
  const runs = data.reduce((sum, item) => sum + item.runs, 0);

  const meterData = (meter?.months ?? []).map((item) => ({
    month: MONTHS[item.month - 1],
    monthName: `${MONTH_NAMES[item.month - 1]} ${year}`,
    wodomierz: item.meterLiters,
    'z czasu pompy': item.estimatedLiters,
  }));
  const meterReady = (meter?.periods.length ?? 0) > 0;
  // bez odczytów do porównania zostaje zwykły wykres zużycia
  const meterMode = meterWanted && meterReady;

  return (
    <div className="settings water-page fill-page">
      <h2>Zużycie wody w okresie</h2>
      <section>
        <div className="resource" ref={cardRef}>
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
              <input type="number" min={2020} max={2100} value={yearText ?? date.slice(0, 4)}
                onChange={(event) => {
                  const text = event.currentTarget.value;
                  setYearText(text);
                  if (/^d{4}$/.test(text)) setDate(`${text}-01-01`);
                }}
                onBlur={() => setYearText(null)} />
            )}
          </div>

          {meterMode ? (
            <>
              <div className="water-chart fill-area">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={meterData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" interval="preserveStartEnd" />
                      <YAxis width={70} tickFormatter={axisFormatter(Math.max(0, ...meterData.flatMap((item) => [item.wodomierz ?? 0, item['z czasu pompy'] ?? 0])))} />
                      <Tooltip
                        formatter={(item) => `${formatLiters(Number(item))} l`}
                        labelFormatter={(label, payload) => payload?.[0]?.payload?.monthName ?? label}
                      />
                      <Legend />
                      <Bar dataKey="wodomierz" fill="#1481a5" />
                      <Bar dataKey="z czasu pompy" fill="#9bbfcc" />
                    </BarChart>
                  </ResponsiveContainer>
              </div>
              {meter?.flow.litersPerMinute !== null && meter?.flow.litersPerMinute !== undefined && (
                <div className="water-hint">
                  Woda z czasu pompy liczona przepływem <strong>{formatLiters(meter.flow.litersPerMinute)} l/min</strong>
                  {' '}(średnia ze wszystkich okresów między odczytami wodomierza).
                </div>
              )}
            </>
          ) : (
            <>
              <div className="water-chart fill-area">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" interval="preserveStartEnd" />
                    <YAxis width={70} tickFormatter={hasFlow
                      ? axisFormatter(Math.max(0, ...data.map((item) => item.woda)))
                      : (value: number) => `${value.toLocaleString('pl-PL')} min`} />
                    <Tooltip
                      formatter={(value, _name, item) => hasFlow
                        ? [`${formatLiters(Number(value))} l, pompa ${formatDuration(item.payload.pumpSeconds)} (${item.payload.runs} uruch.)`, 'Woda']
                        : [`${formatDuration(item.payload.pumpSeconds)} (${item.payload.runs} uruch.)`, 'Pompa']}
                      labelFormatter={(label, payload) => payload?.[0]?.payload?.tooltipLabel ?? label}
                    />
                    <Bar dataKey="woda" fill="#1481a5" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="water-total">
                {summary === null ? 'Wczytywanie…' : <>
                  Razem: {hasFlow && <><strong>{formatLiters(total)} l</strong>, </>}pompa {formatDuration(totalSeconds)} w {runs} uruchomieniach
                </>}
              </div>
              {summary !== null && !hasFlow && (
                <div className="water-hint">
                  Słupki pokazują czas pracy pompy: ilość wody pojawi się po dwóch odczytach wodomierza
                  (Dane → Odczyty wodomierza), z których liczony jest przepływ pompy.
                </div>
              )}
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
