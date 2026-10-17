// Zakładka Dane fotowoltaiki (/data), układ „Instrument” z makiety (#s-pv-dane): pasek filtrów (przełącznik
// Odczyty dnia / Dni miesiąca, nawigacja po dacie, wybór panelu, przycisk CSV) i karta z tabelą (.table-wrap przewija
// się w poziomie, strona nie). Dwa widoki:
// - Odczyty dnia: od najnowszego, najwyżej jeden na minutę — cała instalacja albo jeden panel (port mikrofalownika);
//   GET /photovoltaic/readings;
// - Dni miesiąca: produkcja (z paskiem względem najlepszego dnia) i szczyt mocy w każdym dniu;
//   GET /photovoltaic/summary?period=month.
// Oba z eksportem CSV.
import { useEffect, useState } from 'react';
import { PhotovoltaicRequests } from '../api';
import { PvPanelState, PvReadingRow, PvSummary } from '../types';
import {
  STATE_LABELS, downloadText, formatDay, formatEnergy, formatMonth, formatPower, formatTemp, formatTime, panelName, plural, toCsv,
  todayWarsaw,
} from '../utils/pv';
import { DateNav, DownloadIcon, Segmented } from '../components/ui';
import './style.css';

type View = 'readings' | 'days';

const number = (value: number | undefined, digits = 1) =>
  value === undefined || value === null ? '---' : value.toLocaleString('pl-PL', { maximumFractionDigits: digits });

const WEEKDAYS = ['nd', 'pn', 'wt', 'śr', 'cz', 'pt', 'so'];
const weekday = (day: string) => WEEKDAYS[new Date(`${day}T12:00:00`).getDay()];

const STATE_CHIP: Record<PvPanelState, string> = { produces: 'chip-ok', idle: 'chip-off', offline: 'chip-err', alarm: 'chip-err' };

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
  const canExport = view === 'readings' ? !!rows?.length : days.length > 0;

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

  const hint = view === 'readings'
    ? ['co minutę', 'od najnowszego', rows?.length ? plural(rows.length, ['odczyt', 'odczyty', 'odczytów']) : ''].filter(Boolean).join(' · ')
    : [formatMonth(date), days.length ? plural(days.length, ['dzień', 'dni', 'dni']) + ' z danymi' : ''].filter(Boolean).join(' · ');

  return (
    <div className="page page-device pv-page">
      <div className="filters">
        <Segmented<View> name="pv-dane-z" label="Zakres" value={view} onChange={setView}
          options={[{ value: 'readings', label: 'Odczyty dnia' }, { value: 'days', label: 'Dni miesiąca' }]} />
        <DateNav unit={view === 'readings' ? 'day' : 'month'} date={date} onChange={setDate} />
        {view === 'readings' && (
          <label className="field field-inline">
            <span>Panel</span>
            <select value={panel} onChange={(event) => setPanel(event.currentTarget.value)}>
              <option value="">Cała instalacja</option>
              {panels.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
          </label>
        )}
        <button type="button" className="btn btn-ghost btn-sm" disabled={!canExport} onClick={exportCsv}><DownloadIcon />CSV</button>
      </div>

      <section className="card card-table">
        <header className="card-head">
          <h2>{view === 'readings' ? 'Odczyty dnia' : 'Dni miesiąca'}</h2>
          <span className="card-hint">{hint}</span>
        </header>

        {view === 'days' && (
          <>
            {month === undefined && <p className="help">Wczytywanie…</p>}
            {month === null && <p className="help danger-text">Nie udało się pobrać danych.</p>}
            {month && !days.length && <p className="help">Brak danych z tego miesiąca.</p>}
            {!!days.length && (
              <>
                <div className="table-wrap">
                  <table className="data">
                    <thead><tr><th>Dzień</th><th className="num">Produkcja</th><th className="pv-col-bar" aria-label="Pasek produkcji" /><th className="num">Szczyt</th></tr></thead>
                    <tbody>
                      {days.map((d) => (
                        <tr key={d.key}>
                          <td>{formatDay(d.key)} <small className="pv-dim">{weekday(d.key)}</small></td>
                          <td className="num">{formatEnergy(d.energyWh)}</td>
                          <td className="pv-col-bar">
                            <span className="pv-bar" aria-hidden="true"><span style={{ width: `${Math.round(100 * d.energyWh / (peak || 1))}%` }} /></span>
                          </td>
                          <td className="num">{formatPower(d.peakW)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="table-foot">
                  Razem <strong>{formatEnergy(month!.energyWh)}</strong> w {plural(days.length, ['dniu', 'dniach', 'dniach'])},
                  średnio {formatEnergy(month!.energyWh / days.length)} dziennie.
                </div>
              </>
            )}
          </>
        )}

        {view === 'readings' && (
          <>
            {rows === undefined && <p className="help">Wczytywanie…</p>}
            {rows === null && <p className="help danger-text">Nie udało się pobrać danych.</p>}
            {rows?.length === 0 && (
              <p className="help">
                Brak odczytów{panel ? ' tego panelu' : ''} z tego dnia.
                {panel && ' Szczegóły paneli są od 26.09.2026 (wcześniej tylko sumy instalacji).'}
              </p>
            )}
            {!!rows?.length && (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    {panel ? (
                      <tr><th>Czas</th><th className="num">Moc</th><th className="num">U PV</th><th className="num">I PV</th><th className="num">U sieci</th><th className="num">f</th><th className="num">Temp.</th><th className="num">Dziś</th><th>Stan</th></tr>
                    ) : (
                      <tr><th>Czas</th><th className="num">Moc</th><th className="num">Dziś</th><th className="num">Licznik</th><th className="num">Temp.</th></tr>
                    )}
                  </thead>
                  <tbody>
                    {rows.map((r) => panel ? (
                      // czerwony wiersz tylko przy alarmie; brak łączności (noc) pokazuje sam chip
                      <tr key={r.t} className={r.state === 'alarm' ? 'is-err' : undefined}>
                        <td>{formatTime(r.t)}</td><td className="num">{formatPower(r.power)}</td><td className="num">{number(r.pv_voltage)} V</td>
                        <td className="num">{number(r.pv_current, 2)} A</td><td className="num">{number(r.grid_voltage)} V</td><td className="num">{number(r.grid_frequency, 2)} Hz</td>
                        <td className="num">{formatTemp(r.temperature)}</td><td className="num">{formatEnergy(r.prod_today)}</td>
                        <td>{r.state ? <span className={`chip ${STATE_CHIP[r.state]}`}>{STATE_LABELS[r.state]}</span> : '---'}</td>
                      </tr>
                    ) : (
                      <tr key={r.t}>
                        <td>{formatTime(r.t)}</td><td className="num">{formatPower(r.power)}</td><td className="num">{formatEnergy(r.todayWh)}</td>
                        <td className="num">{formatEnergy(r.totalWh)}</td><td className="num">{formatTemp(r.temperature)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
};
