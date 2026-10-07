// Zakładka Dane fotowoltaiki (/data), dwa widoki:
// - Odczyty dnia: od najnowszego, najwyżej jeden na minutę — cała instalacja albo jeden panel
//   (port mikrofalownika); GET /photovoltaic/readings;
// - Dni miesiąca: produkcja i szczyt mocy w każdym dniu; GET /photovoltaic/summary?period=month.
// Oba z eksportem CSV.
import { useEffect, useState } from 'react';
import { PhotovoltaicRequests } from '../api';
import { PvReadingRow, PvSummary } from '../types';
import {
  STATE_LABELS, downloadText, formatDay, formatEnergy, formatPower, formatTemp, formatTime, panelName, toCsv, todayWarsaw,
} from '../utils/pv';
import './style.css';

type View = 'readings' | 'days';

const number = (value: number | undefined, digits = 1) =>
  value === undefined || value === null ? '---' : value.toLocaleString('pl-PL', { maximumFractionDigits: digits });

const WEEKDAYS = ['nd', 'pn', 'wt', 'śr', 'cz', 'pt', 'so'];
const weekday = (day: string) => WEEKDAYS[new Date(`${day}T12:00:00`).getDay()];

export const PhotovoltaicData: React.FC = () => {
  const [view, setView] = useState<View>('readings');
  const [date, setDate] = useState(todayWarsaw());
  const [panel, setPanel] = useState('');
  const [panels, setPanels] = useState<{ key: string; label: string }[]>([]);
  const [rows, setRows] = useState<PvReadingRow[] | null | undefined>(undefined);
  const [month, setMonth] = useState<PvSummary | null | undefined>(undefined);

  // lista paneli z ostatniego odczytu (mikrofalowniki i porty)
  useEffect(() => {
    PhotovoltaicRequests.getInverters().then((result) => setPanels((result?.inverters ?? []).flatMap((inverter) =>
      inverter.ports.map((port) => ({ key: `${inverter.serial}-${port.port}`, label: panelName(inverter.serial, port.port) })))));
  }, []);

  // spóźniona odpowiedź dla poprzedniego wyboru nie nadpisuje bieżącej
  useEffect(() => {
    let active = true;
    if (view === 'readings') {
      setRows(undefined);
      PhotovoltaicRequests.getReadings(date, panel || undefined).then((result) => active && setRows(result));
    } else {
      setMonth(undefined);
      PhotovoltaicRequests.getSummary('month', date.slice(0, 7)).then((result) => active && setMonth(result));
    }
    return () => { active = false; };
  }, [view, date, panel]);

  const days = [...(month?.buckets ?? [])].reverse();
  const peak = Math.max(0, ...days.map((d) => d.energyWh));

  const exportCsv = () => {
    if (view === 'days') {
      if (!days.length) return;
      downloadText(toCsv(['Dzień', 'Produkcja [Wh]', 'Szczyt mocy [W]'], days.map((d) => [d.key, d.energyWh, d.peakW])),
        `fotowoltaika-${date.slice(0, 7)}.csv`);
      return;
    }
    if (!rows?.length) return;
    const csv = panel
      ? toCsv(['Czas', 'Moc [W]', 'Napięcie PV [V]', 'Prąd PV [A]', 'Napięcie sieci [V]', 'Częstotliwość [Hz]', 'Temperatura [°C]', 'Dziś [Wh]', 'Stan'],
        rows.map((r) => [formatTime(r.t), r.power, r.pv_voltage, r.pv_current, r.grid_voltage, r.grid_frequency, r.temperature, r.prod_today, r.state && STATE_LABELS[r.state]]))
      : toCsv(['Czas', 'Moc [W]', 'Dziś [Wh]', 'Licznik [Wh]', 'Temperatura [°C]'],
        rows.map((r) => [formatTime(r.t), r.power, r.todayWh, r.totalWh, r.temperature]));
    downloadText(csv, `fotowoltaika-${date}${panel ? `-${panel}` : ''}.csv`);
  };

  return (
    <div className="settings pv-page">
      <h2>Dane</h2>
      <section>
        <div className="resource pv-data">
          <div className="pv-periods pv-views" role="radiogroup" aria-label="Widok">
            <label><input type="radio" name="pv-view" checked={view === 'readings'} onChange={() => setView('readings')} />Odczyty dnia</label>
            <label><input type="radio" name="pv-view" checked={view === 'days'} onChange={() => setView('days')} />Dni miesiąca</label>
          </div>
          <div className="pv-toolbar">
            {view === 'readings' ? (
              <>
                <input type="date" value={date} max={todayWarsaw()}
                  onChange={(event) => event.currentTarget.value && setDate(event.currentTarget.value)} />
                <select value={panel} onChange={(event) => setPanel(event.currentTarget.value)} aria-label="Zakres danych">
                  <option value="">Cała instalacja</option>
                  {panels.map((item) => <option key={item.key} value={item.key}>Panel {item.label}</option>)}
                </select>
              </>
            ) : (
              <input type="month" value={date.slice(0, 7)}
                onChange={(event) => event.currentTarget.value && setDate(`${event.currentTarget.value}-01`)} />
            )}
            <button type="button" className="pv-toolbar-end"
              disabled={view === 'readings' ? !rows?.length : !days.length} onClick={exportCsv}>CSV</button>
          </div>

          {view === 'days' && (
            <>
              {month === undefined && <div className="pv-hint">Wczytywanie…</div>}
              {month === null && <div className="pv-bad">Nie udało się pobrać danych.</div>}
              {month && !days.length && <div className="pv-hint">Brak danych z tego miesiąca.</div>}
              {!!days.length && (
                <>
                  <div className="pv-total">
                    Razem: <strong>{formatEnergy(month!.energyWh)}</strong> w {days.length} dniach,
                    średnio {formatEnergy(month!.energyWh / days.length)} dziennie
                  </div>
                  <div className="pv-table-scroll">
                    <table className="pv-table">
                      <thead><tr><th>Dzień</th><th>Produkcja</th><th className="pv-col-bar" /><th>Szczyt</th></tr></thead>
                      <tbody>
                        {days.map((d) => (
                          <tr key={d.key}>
                            <td>{formatDay(d.key)} <span className="pv-hint">{weekday(d.key)}</span></td>
                            <td>{formatEnergy(d.energyWh)}</td>
                            <td className="pv-col-bar">
                              <span className="pv-panel-bar"><span style={{ width: `${Math.round(100 * d.energyWh / (peak || 1))}%` }} /></span>
                            </td>
                            <td>{formatPower(d.peakW)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}

          {view === 'readings' && (
            <>
              {rows === undefined && <div className="pv-hint">Wczytywanie…</div>}
              {rows === null && <div className="pv-bad">Nie udało się pobrać danych.</div>}
              {rows?.length === 0 && (
                <div className="pv-hint">
                  Brak odczytów{panel ? ' tego panelu' : ''} z tego dnia.
                  {panel && ' Szczegóły paneli są od 26.09.2026 (wcześniej tylko sumy instalacji).'}
                </div>
              )}
              {!!rows?.length && (
                <div className="pv-table-scroll">
                  <table className="pv-table">
                    <thead>
                      {panel ? (
                        <tr><th>Czas</th><th>Moc</th><th>U PV</th><th>I PV</th><th>U sieci</th><th>Hz</th><th>Temp.</th><th>Dziś</th><th>Stan</th></tr>
                      ) : (
                        <tr><th>Czas</th><th>Moc</th><th>Dziś</th><th>Licznik</th><th>Temp.</th></tr>
                      )}
                    </thead>
                    <tbody>
                      {rows.map((r) => panel ? (
                        <tr key={r.t} className={r.state === 'offline' || r.state === 'alarm' ? 'pv-bad' : ''}>
                          <td>{formatTime(r.t)}</td><td>{formatPower(r.power)}</td><td>{number(r.pv_voltage)} V</td>
                          <td>{number(r.pv_current, 2)} A</td><td>{number(r.grid_voltage)} V</td><td>{number(r.grid_frequency, 2)}</td>
                          <td>{formatTemp(r.temperature)}</td><td>{formatEnergy(r.prod_today)}</td><td>{r.state ? STATE_LABELS[r.state] : '---'}</td>
                        </tr>
                      ) : (
                        <tr key={r.t}>
                          <td>{formatTime(r.t)}</td><td>{formatPower(r.power)}</td><td>{formatEnergy(r.todayWh)}</td>
                          <td>{formatEnergy(r.totalWh)}</td><td>{formatTemp(r.temperature)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
};
