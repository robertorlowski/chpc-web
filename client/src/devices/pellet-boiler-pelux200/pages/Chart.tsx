// Zakładka Wykres kotła pelletowego (/chart): temperatury z wybranego dnia (GET /pellet-boiler-pelux200/list,
// co interwał odpytywania sterownika). Domyślnie CO (obieg grzejników = mieszacz 1) i CWU; kocioł,
// mieszacz 2 i temperatura zewnętrzna do włączenia przełącznikami. Dane pobierane przy wejściu
// i zmianie daty, bez odświeżania cyklicznego. Karta na całe okno (useFillHeight, klasa fill-page):
// wykres wypełnia miejsce między wyborem dnia a przełącznikami serii. Oś X to czas (liczba ms), nie kolejne
// odczyty: od 2026-10-07 serwer nie zapisuje identycznych odczytów (seria = rekord początkowy i końcowy, nowy
// co najwyżej co 10 min), więc odstępy między punktami są nierówne.
import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useFillHeight } from '../../../core/components/useFillHeight';
import { PelletBoilerRequests } from '../api';
import { PelletBoilerFuel, PelletBoilerFuelPeriod, PelletBoilerReading } from '../types';
import { formatNumber, formatTemp, todayWarsaw } from '../utils/boiler';
import './style.css';

type SeriesKey = 'mixer1_temp' | 'water_heater_temp' | 'heating_temp' | 'mixer2_temp' | 'outside_temp';

const SERIES: { key: SeriesKey; label: string; color: string; visible: boolean }[] = [
  { key: 'mixer1_temp', label: 'CO', color: '#d0521b', visible: true },
  { key: 'water_heater_temp', label: 'CWU', color: '#1481a5', visible: true },
  { key: 'heating_temp', label: 'Kocioł', color: '#8e44ad', visible: false },
  { key: 'mixer2_temp', label: 'Mieszacz 2', color: '#2e7d32', visible: false },
  { key: 'outside_temp', label: 'Zewnętrzna', color: '#777777', visible: false },
];

const timeLabel = (ms: number) =>
  Number.isFinite(ms) ? new Date(ms).toLocaleTimeString('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit' }) : '';

const MONTHS = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
const PERIODS: { key: PelletBoilerFuelPeriod; label: string }[] = [
  { key: 'day', label: 'Dzień' }, { key: 'month', label: 'Miesiąc' }, { key: 'year', label: 'Rok' },
];

// Widok „Pellet”: spalony pellet [kg] w godzinach dnia, dniach miesiąca albo miesiącach roku (GET …/fuel,
// licznik ze sterownika od firmware 1.7.1). Szacunek regulatora z pracy podajnika — dokładność zależy od kalibracji.
const FuelChart: React.FC<{ date: string; setDate: (date: string) => void }> = ({ date, setDate }) => {
  const [period, setPeriod] = useState<PelletBoilerFuelPeriod>('day');
  const [fuel, setFuel] = useState<PelletBoilerFuel | null | undefined>(undefined);
  const [yearText, setYearText] = useState<string | null>(null);
  useEffect(() => {
    setFuel(undefined);
    PelletBoilerRequests.getFuel(period, date).then(setFuel);
  }, [period, date]);
  const data = (fuel?.buckets ?? []).map((bucket) => ({
    label: period === 'day' ? String(bucket.key) : period === 'month' ? String(bucket.key) : MONTHS[bucket.key - 1],
    kg: bucket.kg,
  }));
  return (
    <>
      <div className="boiler-toolbar">
        {PERIODS.map((item) => (
          <button key={item.key} type="button" className={period === item.key ? 'boiler-profile-active' : 'boiler-profile'}
            onClick={() => setPeriod(item.key)}>{item.label}</button>
        ))}
        {period === 'day' && <input type="date" value={date} onChange={(event) => event.currentTarget.value && setDate(event.currentTarget.value)} />}
        {period === 'month' && <input type="month" value={date.slice(0, 7)} onChange={(event) => event.currentTarget.value && setDate(`${event.currentTarget.value}-01`)} />}
        {period === 'year' && (
          <input type="number" min={2020} max={2100} value={yearText ?? date.slice(0, 4)} onBlur={() => setYearText(null)}
            onChange={(event) => {
              const text = event.currentTarget.value;
              setYearText(text);
              if (/^d{4}$/.test(text)) setDate(`${text}-01-01`);
            }} />
        )}
      </div>
      {fuel === undefined && <div className="fill-area">Wczytywanie…</div>}
      {fuel === null && <div className="fill-area boiler-error">Nie udało się wczytać danych.</div>}
      {fuel && fuel.counterKg === null && <div className="fill-area">Brak licznika pelletu w tym okresie (sterownik od wersji 1.7.1).</div>}
      {fuel && fuel.counterKg !== null && (
        <>
          <div className="boiler-hint">Razem: <strong>{formatNumber(fuel.totalKg)} kg</strong></div>
          <div className="boiler-chart fill-area">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" interval="preserveStartEnd" minTickGap={8} />
                <YAxis width={44} unit=" kg" />
                <Tooltip formatter={(value) => [`${formatNumber(Number(value))} kg`, 'Pellet']} />
                <Bar dataKey="kg" fill="#b5651d" isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </>
  );
};

const CHART_TABS: { value: 'temperatures' | 'fuel'; label: string }[] = [
  { value: 'temperatures', label: 'Temperatury' },
  { value: 'fuel', label: 'Spalony pellet' },
];

export const PelletBoilerChart: React.FC = () => {
  const cardRef = useFillHeight<HTMLDivElement>();
  const [mode, setMode] = useState<'temperatures' | 'fuel'>('temperatures');
  const [date, setDate] = useState(todayWarsaw());
  const [readings, setReadings] = useState<PelletBoilerReading[] | null>(null);
  const [visible, setVisible] = useState<Record<SeriesKey, boolean>>(
    () => Object.fromEntries(SERIES.map((series) => [series.key, series.visible])) as Record<SeriesKey, boolean>);

  useEffect(() => {
    setReadings(null);
    PelletBoilerRequests.getList(date).then((result) => setReadings(result ?? []));
  }, [date]);

  // serwer zwraca malejąco, wykres idzie od rana
  const data = [...(readings ?? [])].reverse().filter((r) => r.createdAt).map((r) => ({
    time: new Date(r.createdAt as string).getTime(),
    ...Object.fromEntries(SERIES.map((series) => [series.key, r[series.key]])),
  }));

  return (
    <div className="settings boiler-page fill-page">
      <h2>Wykres</h2>
      {/* zakładki jak w Danych hydroforu (water-tabs): temperatury dnia albo spalony pellet */}
      <div className="boiler-tabs" role="tablist">
        {CHART_TABS.map((tab) => (
          <button key={tab.value} type="button" role="tab" aria-selected={mode === tab.value}
            className={mode === tab.value ? 'active' : ''} onClick={() => setMode(tab.value)}>
            {tab.label}
          </button>
        ))}
      </div>
      <section>
        <div className="resource" ref={cardRef}>
          {mode === 'fuel' && <FuelChart date={date} setDate={setDate} />}
          {mode === 'temperatures' && <>
          <div className="boiler-toolbar">
            <label>Dzień:{' '}
              <input type="date" value={date} onChange={(event) => event.currentTarget.value && setDate(event.currentTarget.value)} />
            </label>
          </div>

          {readings === null && <div className="fill-area">Wczytywanie…</div>}
          {readings?.length === 0 && <div className="fill-area">Brak odczytów w tym dniu.</div>}
          {readings && readings.length > 0 && (
            <div className="boiler-chart fill-area">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" type="number" scale="time" domain={['dataMin', 'dataMax']}
                    tickFormatter={timeLabel} minTickGap={24} />
                  <YAxis width={44} unit="°" domain={['auto', 'auto']} />
                  <Tooltip labelFormatter={(value) => timeLabel(Number(value))} formatter={(value, name) => [formatTemp(Number(value)), SERIES.find((s) => s.key === name)?.label ?? name]} />
                  {SERIES.filter((series) => visible[series.key]).map((series) => (
                    <Line key={series.key} type="monotone" dataKey={series.key} stroke={series.color}
                      strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="boiler-series">
            {SERIES.map((series) => (
              <label key={series.key}>
                <input type="checkbox" checked={visible[series.key]}
                  onChange={(event) => setVisible({ ...visible, [series.key]: event.currentTarget.checked })} />
                <span className="boiler-series-swatch" style={{ background: series.color }} />
                {series.label}
              </label>
            ))}
          </div>
          </>}
        </div>
      </section>
    </div>
  );
};
