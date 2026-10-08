// Widok główny fotowoltaiki (/): bieżąca moc i temperatura, produkcja dziś / w tym miesiącu / całkowita,
// krzywa mocy z dzisiaj oraz panele pogrupowane po mikrofalownikach z mocą i stanem (produkuje,
// bez produkcji, brak łączności, alarm). GET /photovoltaic/current i /day, odświeżanie co 60 s.
import { useEffect, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PhotovoltaicRequests } from '../api';
import { PvCurrent, PvDay, PvPanel } from '../types';
import {
  STATE_LABELS, formatDateTime, formatDay, formatEnergy, formatPower, formatTemp, formatTime, shortSerial, todayWarsaw,
  warsawDay,
} from '../utils/pv';
import './style.css';
import { OfflineBanner } from '../../../core/components/OfflineBanner';

const REFRESH_MS = 60_000;

const byInverter = (panels: PvPanel[]) => {
  const groups = new Map<string, PvPanel[]>();
  for (const panel of panels) groups.set(panel.serial, [...(groups.get(panel.serial) ?? []), panel]);
  return [...groups];
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
  const working = panels.filter((p) => p.state === 'produces').length;
  const problems = panels.filter((p) => p.state === 'offline' || p.state === 'alarm');
  // skala pasków: szczyt paneli w tym dniu (wieczorne 5 W daje wąski pasek, nie pełny)
  const maxPanelPower = Math.max(1, ...panels.map((p) => p.power ?? 0),
    ...(day?.panels ?? []).flatMap((p) => p.points.map((point) => point.power)));
  const dayTitle = day && day.date !== todayWarsaw() ? `Moc ${formatDay(day.date)}` : 'Moc dzisiaj';
  const status = !current?.readAt || current.stale ? '' : (current.power ?? 0) > 0 ? 'produkuje' : 'bez produkcji';
  const chartData = (day?.points ?? []).map((p) => ({ label: formatTime(p.t), moc: p.power }));

  return (
    <div className="settings pv-page">
      <h2>
        Fotowoltaika
        {status && <>: <span className={current?.stale ? 'pv-bad' : (current?.power ?? 0) > 0 ? 'pv-on' : ''}>{status}</span></>}
      </h2>
      <section>
        {current === undefined && <div className="resource">Wczytywanie…</div>}
        {current === null && <div className="resource pv-bad">Nie udało się pobrać danych.</div>}
        {current && !current.readAt && <div className="resource">Brak odczytów z instalacji PV.</div>}
        {current?.readAt && (
          <>
            <div className="resource pv-now">
              {current.stale && <OfflineBanner since={current.readAt} />}
              <div className="pv-now-power">{formatPower(current.power)}</div>
              <div className="pv-now-caption">moc bieżąca paneli (DC)</div>
              <div className="pv-tiles">
                <div><strong>{formatEnergy(current.todayWh)}</strong><span>dziś</span></div>
                <div>
                  <strong>{formatEnergy(current.monthWh)}</strong>
                  <span>w tym miesiącu</span>
                </div>
                <div><strong>{formatEnergy(current.totalWh)}</strong><span>łącznie</span></div>
                <div><strong>{formatTemp(current.temperature)}</strong><span>temperatura</span></div>
              </div>
              <div className="pv-hint">
                Odczyt: {formatDateTime(current.readAt)}
              </div>
            </div>

            <div className="resource">
              <h3 className="settings-section-title">{dayTitle}</h3>
              {chartData.length ? (
                <div className="pv-chart pv-chart-small">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" interval="preserveStartEnd" minTickGap={30} />
                      <YAxis width={60} tick={{ fontSize: 12 }} tickFormatter={(value: number) => formatPower(value)} />
                      <Tooltip formatter={(value) => [formatPower(Number(value)), 'Moc']} />
                      <Area type="monotone" dataKey="moc" stroke="#e0a100" fill="#ffd54f" fillOpacity={0.5} isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : <div className="pv-hint">Brak odczytów z tego dnia.</div>}
              {day?.peakW !== undefined && (
                <div className="pv-hint">Produkcja {formatEnergy(day.energyWh)}, szczyt {formatPower(day.peakW)} o {formatTime(day.peakAt)}</div>
              )}
            </div>

            <div className="resource">
              <h3 className="settings-section-title">Panele</h3>
              {!current.panelsAvailable && <div className="pv-hint">Ostatni odczyt nie ma szczegółów paneli.</div>}
              {current.panelsAvailable && (
                <>
                  <div className={problems.length ? 'pv-bad' : 'pv-summary'}>
                    {problems.length
                      ? `Uwaga: ${problems.length} z ${panels.length} paneli bez łączności lub z alarmem`
                      : `Wszystkie panele mają łączność; produkuje ${working} z ${panels.length}`}
                  </div>
                  {byInverter(panels).map(([serial, items]) => (
                    <div key={serial} className="pv-inverter">
                      <div className="pv-inverter-title">Mikrofalownik {shortSerial(serial)}</div>
                      {items.map((panel) => (
                        <div key={panel.key} className={`pv-panel pv-panel-${panel.state}`}>
                          <span className="pv-panel-name">Port {panel.port}</span>
                          <span className="pv-panel-bar" aria-hidden="true">
                            <span style={{ width: `${Math.round(100 * (panel.power ?? 0) / maxPanelPower)}%` }} />
                          </span>
                          <span className="pv-panel-power">{formatPower(panel.power)}</span>
                          <span className="pv-panel-state">{STATE_LABELS[panel.state]}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
};
