// Zakładka Wykres fotowoltaiki (/chart), jak w Hoymiles S-Miles Cloud: Dzień — krzywa mocy
// (przedziały 5 min, opcjonalnie każdy panel osobno), Miesiąc — produkcja w dniach, Rok — w
// miesiącach, Całość — w latach. GET /photovoltaic/day i /photovoltaic/summary. Karta na całe okno (useFillHeight,
// klasa fill-page): wykres wypełnia wolne miejsce, jak na wykresach pompy ciepła, hydroforu i pieca.
// „Moc paneli”: panele do pokazania wybiera się polami wyboru, pogrupowanymi według mikrofalowników (sterowników);
// domyślnie widoczne są panele pierwszego mikrofalownika, bo wszystkie 10 krzywych naraz jest nieczytelne.
import { useEffect, useState } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useFillHeight } from '../../../core/components/useFillHeight';
import { PhotovoltaicRequests } from '../api';
import { PvDay, PvSummary, PvSummaryPeriod } from '../types';
import { formatDay, formatEnergy, formatPower, formatTime, panelName, shortSerial, todayWarsaw } from '../utils/pv';
import './style.css';

type Period = 'day' | PvSummaryPeriod;

const PERIODS: { value: Period; label: string }[] = [
  { value: 'day', label: 'Dzień' },
  { value: 'month', label: 'Miesiąc' },
  { value: 'year', label: 'Rok' },
  { value: 'total', label: 'Całość' },
];

const MONTHS = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
// kolory linii paneli (10 portów u nas)
const COLORS = ['#1481a5', '#e0a100', '#2e7d32', '#b00020', '#6a1b9a', '#00838f', '#ef6c00', '#5d4037', '#3949ab', '#7cb342'];

const bucketLabel = (period: PvSummaryPeriod, key: string) =>
  period === 'month' ? String(Number(key.slice(8, 10))) : period === 'year' ? MONTHS[Number(key.slice(5, 7)) - 1] : key;

export const PhotovoltaicChart: React.FC = () => {
  const cardRef = useFillHeight<HTMLDivElement>(360);
  const [period, setPeriod] = useState<Period>('day');
  const [date, setDate] = useState(todayWarsaw());
  // dzień: cała instalacja, moc każdego panelu albo produkcja paneli (słupki do porównania)
  const [dayView, setDayView] = useState<'total' | 'power' | 'energy'>('total');
  // wybrane panele (klucze serial-port) w widoku „Moc paneli”; null = domyślnie pierwszy mikrofalownik
  const [selectedPanels, setSelectedPanels] = useState<Set<string> | null>(null);
  const [day, setDay] = useState<PvDay | null | undefined>(undefined);
  const [summary, setSummary] = useState<PvSummary | null | undefined>(undefined);

  // spóźniona odpowiedź dla poprzedniej daty lub okresu nie nadpisuje bieżącej
  useEffect(() => {
    let active = true;
    if (period === 'day') {
      setDay(undefined);
      PhotovoltaicRequests.getDay(date).then((result) => active && setDay(result));
    } else {
      setSummary(undefined);
      PhotovoltaicRequests.getSummary(period, period === 'month' ? date.slice(0, 7) : date.slice(0, 4))
        .then((result) => active && setSummary(result));
    }
    return () => { active = false; };
  }, [period, date]);

  const dayData = (day?.points ?? []).map((p) => ({ label: formatTime(p.t), moc: p.power }));
  const panelsData = (() => {
    if (!day?.panels.length) return [];
    const rows = new Map<string, Record<string, number | string>>();
    for (const panel of day.panels) {
      for (const point of panel.points) {
        const row = rows.get(point.t) ?? { label: formatTime(point.t) };
        row[panel.key] = point.power;
        rows.set(point.t, row);
      }
    }
    return [...rows].sort((a, b) => a[0].localeCompare(b[0])).map(([, row]) => row);
  })();
  const panelEnergy = (day?.panels ?? []).map((panel) => ({
    label: `${panel.serial.slice(-2)}/${panel.port}`,
    name: panelName(panel.serial, panel.port),
    kwh: Math.round((panel.energyWh ?? 0) / 10) / 100,
    energyWh: panel.energyWh ?? 0,
  }));
  const averageWh = panelEnergy.length ? panelEnergy.reduce((sum, p) => sum + p.energyWh, 0) / panelEnergy.length : 0;
  const hasPanels = !!day?.panels.length;
  const view = hasPanels ? dayView : 'total';

  // panele pogrupowane według mikrofalowników (numer seryjny), z kolorem krzywej stałym niezależnie od wyboru
  const inverters = (() => {
    const groups = new Map<string, { key: string; port: number; color: string }[]>();
    (day?.panels ?? []).forEach((panel, index) => {
      const list = groups.get(panel.serial) ?? [];
      list.push({ key: panel.key, port: panel.port, color: COLORS[index % COLORS.length] });
      groups.set(panel.serial, list);
    });
    return [...groups].sort((a, b) => a[0].localeCompare(b[0])).map(([serial, panels]) => ({ serial, panels }));
  })();
  const allKeys = new Set(inverters.flatMap((inverter) => inverter.panels.map((panel) => panel.key)));
  const shown = new Set(
    selectedPanels ? [...selectedPanels].filter((key) => allKeys.has(key)) : (inverters[0]?.panels.map((panel) => panel.key) ?? []),
  );
  const togglePanels = (keys: string[], on: boolean) => {
    const next = new Set(shown);
    keys.forEach((key) => (on ? next.add(key) : next.delete(key)));
    setSelectedPanels(next);
  };
  const summaryData = (summary?.buckets ?? []).map((b) => ({
    label: period === 'day' ? b.key : bucketLabel(period as PvSummaryPeriod, b.key),
    kwh: Math.round(b.energyWh / 100) / 10,
    energyWh: b.energyWh,
    peakW: b.peakW,
    days: b.days,
    tooltip: period === 'month' ? formatDay(b.key) : period === 'year' ? `${MONTHS[Number(b.key.slice(5, 7)) - 1]} ${b.key.slice(0, 4)}` : b.key,
  }));

  return (
    <div className="settings pv-page fill-page">
      <h2>Produkcja energii</h2>
      <section>
        <div className="resource" ref={cardRef}>
          <div className="pv-toolbar">
            <div className="pv-periods" role="radiogroup" aria-label="Okres">
              {PERIODS.map((item) => (
                <label key={item.value}>
                  <input type="radio" name="pv-period" value={item.value} checked={period === item.value}
                    onChange={() => setPeriod(item.value)} />
                  {item.label}
                </label>
              ))}
            </div>
            {period === 'day' && (
              <input type="date" value={date} max={todayWarsaw()}
                onChange={(event) => event.currentTarget.value && setDate(event.currentTarget.value)} />
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

          {period === 'day' && (
            <>
              <div className="pv-chart fill-area">
                <ResponsiveContainer width="100%" height="100%">
                  {view === 'energy' ? (
                    <BarChart data={panelEnergy}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" interval={0} tick={{ fontSize: 11 }} />
                      <YAxis width={44} tick={{ fontSize: 12 }} tickFormatter={(value: number) => value.toLocaleString('pl-PL')}
                        label={{ value: 'kWh', position: 'insideTopLeft', offset: -2, fontSize: 12 }} />
                      <Tooltip formatter={(_value, _name, item) => [formatEnergy(item.payload.energyWh), 'Produkcja']}
                        labelFormatter={(label, payload) => payload?.[0]?.payload?.name ?? label} />
                      <Bar dataKey="kwh" isAnimationActive={false}>
                        {panelEnergy.map((p) => (
                          <Cell key={p.label} fill={p.energyWh < averageWh * 0.85 ? '#b00020' : '#e0a100'} />
                        ))}
                      </Bar>
                    </BarChart>
                  ) : view === 'power' && panelsData.length ? (
                    <LineChart data={panelsData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" interval="preserveStartEnd" minTickGap={30} />
                      <YAxis width={56} tickFormatter={(value: number) => formatPower(value)} />
                      <Tooltip formatter={(value, name) => [formatPower(Number(value)), panelName(String(name).split('-')[0], Number(String(name).split('-')[1]))]} />
                      <Legend formatter={(name) => panelName(String(name).split('-')[0], Number(String(name).split('-')[1]))} />
                      {day!.panels.map((panel, index) => (shown.has(panel.key) ? (
                        <Line key={panel.key} type="monotone" dataKey={panel.key} dot={false} stroke={COLORS[index % COLORS.length]} isAnimationActive={false} />
                      ) : null))}
                    </LineChart>
                  ) : (
                    <AreaChart data={dayData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" interval="preserveStartEnd" minTickGap={30} />
                      <YAxis width={56} tickFormatter={(value: number) => formatPower(value)} />
                      <Tooltip formatter={(value) => [formatPower(Number(value)), 'Moc']} />
                      <Area type="monotone" dataKey="moc" stroke="#e0a100" fill="#ffd54f" fillOpacity={0.5} isAnimationActive={false} />
                    </AreaChart>
                  )}
                </ResponsiveContainer>
              </div>
              <div className="pv-total">
                {day === undefined ? 'Wczytywanie…' : day === null ? 'Nie udało się pobrać danych.' : !dayData.length ? 'Brak odczytów z tego dnia.' : (
                  <>Produkcja: <strong>{formatEnergy(day.energyWh)}</strong>, szczyt {formatPower(day.peakW)} o {formatTime(day.peakAt)}</>
                )}
              </div>
              <div className="pv-periods pv-day-views" role="radiogroup" aria-label="Widok dnia">
                {([['total', 'Instalacja'], ['power', 'Moc paneli'], ['energy', 'Produkcja paneli']] as const).map(([value, label]) => (
                  <label key={value}>
                    <input type="radio" name="pv-day-view" value={value} checked={view === value}
                      disabled={value !== 'total' && !hasPanels} onChange={() => setDayView(value)} />
                    {label}
                  </label>
                ))}
              </div>
              {view === 'power' && hasPanels && (
                <div className="pv-picker" role="group" aria-label="Panele na wykresie">
                  {inverters.map((inverter) => {
                    const keys = inverter.panels.map((panel) => panel.key);
                    const count = keys.filter((key) => shown.has(key)).length;
                    return (
                      <div key={inverter.serial} className="pv-picker-group">
                        <label className="pv-picker-title">
                          <input type="checkbox" checked={count === keys.length}
                            ref={(element) => { if (element) element.indeterminate = count > 0 && count < keys.length; }}
                            onChange={(event) => togglePanels(keys, event.currentTarget.checked)} />
                          Mikrofalownik {shortSerial(inverter.serial)}
                        </label>
                        {inverter.panels.map((panel) => (
                          <label key={panel.key} className="pv-picker-port">
                            <input type="checkbox" checked={shown.has(panel.key)}
                              onChange={(event) => togglePanels([panel.key], event.currentTarget.checked)} />
                            <span className="pv-picker-swatch" style={{ background: panel.color }} />
                            port {panel.port}
                          </label>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
              {day && !hasPanels && dayData.length > 0 && (
                <div className="pv-hint">Brak szczegółów paneli z tego dnia (są od 26.09.2026).</div>
              )}
              {view === 'energy' && (
                <div className="pv-hint">
                  Średnio {formatEnergy(averageWh)} na panel; na czerwono panele z produkcją niższą o ponad 15% od średniej
                  (zacienienie, zabrudzenie, usterka). Etykieta: końcówka numeru mikrofalownika / port.
                </div>
              )}
            </>
          )}

          {period !== 'day' && (
            <>
              <div className="pv-chart fill-area">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summaryData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" interval="preserveStartEnd" />
                    <YAxis width={44} tick={{ fontSize: 12 }} tickFormatter={(value: number) => value.toLocaleString('pl-PL')}
                      label={{ value: 'kWh', position: 'insideTopLeft', offset: -2, fontSize: 12 }} />
                    <Tooltip
                      formatter={(_value, _name, item) => [`${formatEnergy(item.payload.energyWh)}, szczyt ${formatPower(item.payload.peakW)}`
                        + (period === 'month' ? '' : `, dni z danymi: ${item.payload.days}`), 'Produkcja']}
                      labelFormatter={(label, payload) => payload?.[0]?.payload?.tooltip ?? label}
                    />
                    <Bar dataKey="kwh" fill="#e0a100" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="pv-total">
                {summary === undefined ? 'Wczytywanie…' : summary === null ? 'Nie udało się pobrać danych.' : (
                  <>Razem: <strong>{formatEnergy(summary.energyWh)}</strong>{summaryData.length ? '' : ' (brak danych w tym okresie)'}</>
                )}
              </div>
              <div className="pv-hint">Produkcja liczona z dni, z których są dane w systemie (licznik dzienny DTU).</div>
            </>
          )}
        </div>
      </section>
    </div>
  );
};
