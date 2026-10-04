// Zakładka Wykres kotła pelletowego (/chart): temperatury z wybranego dnia (GET /pellet-boiler-pelux200/list,
// co interwał odpytywania sterownika). Domyślnie CO (obieg grzejników = mieszacz 1) i CWU; kocioł,
// mieszacz 2 i temperatura zewnętrzna do włączenia przełącznikami. Dane pobierane przy wejściu
// i zmianie daty, bez odświeżania cyklicznego. Karta na całe okno (useFillHeight, klasa fill-page):
// wykres wypełnia miejsce między wyborem dnia a przełącznikami serii.
import { useEffect, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useFillHeight } from '../../../core/components/useFillHeight';
import { PelletBoilerRequests } from '../api';
import { PelletBoilerReading } from '../types';
import { formatTemp, todayWarsaw } from '../utils/boiler';
import './style.css';

type SeriesKey = 'mixer1_temp' | 'water_heater_temp' | 'heating_temp' | 'mixer2_temp' | 'outside_temp';

const SERIES: { key: SeriesKey; label: string; color: string; visible: boolean }[] = [
  { key: 'mixer1_temp', label: 'CO', color: '#d0521b', visible: true },
  { key: 'water_heater_temp', label: 'CWU', color: '#1481a5', visible: true },
  { key: 'heating_temp', label: 'Kocioł', color: '#8e44ad', visible: false },
  { key: 'mixer2_temp', label: 'Mieszacz 2', color: '#2e7d32', visible: false },
  { key: 'outside_temp', label: 'Zewnętrzna', color: '#777777', visible: false },
];

const timeLabel = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit' }) : '';

export const PelletBoilerChart: React.FC = () => {
  const cardRef = useFillHeight<HTMLDivElement>();
  const [date, setDate] = useState(todayWarsaw());
  const [readings, setReadings] = useState<PelletBoilerReading[] | null>(null);
  const [visible, setVisible] = useState<Record<SeriesKey, boolean>>(
    () => Object.fromEntries(SERIES.map((series) => [series.key, series.visible])) as Record<SeriesKey, boolean>);

  useEffect(() => {
    setReadings(null);
    PelletBoilerRequests.getList(date).then((result) => setReadings(result ?? []));
  }, [date]);

  // serwer zwraca malejąco, wykres idzie od rana
  const data = [...(readings ?? [])].reverse().map((r) => ({
    time: timeLabel(r.createdAt),
    ...Object.fromEntries(SERIES.map((series) => [series.key, r[series.key]])),
  }));

  return (
    <div className="settings boiler-page fill-page">
      <h2>Wykres temperatur</h2>
      <section>
        <div className="resource" ref={cardRef}>
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
                  <XAxis dataKey="time" interval="preserveStartEnd" minTickGap={24} />
                  <YAxis width={44} unit="°" domain={['auto', 'auto']} />
                  <Tooltip formatter={(value, name) => [formatTemp(Number(value)), SERIES.find((s) => s.key === name)?.label ?? name]} />
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
        </div>
      </section>
    </div>
  );
};
