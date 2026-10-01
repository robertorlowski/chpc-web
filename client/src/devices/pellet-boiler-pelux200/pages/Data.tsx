// Zakładka Dane kotła pelletowego (/data): odczyty z wybranego dnia (GET /pellet-boiler-pelux200/list)
// z eksportem CSV. Dane pobierane przy wejściu i zmianie daty, bez odświeżania cyklicznego.
import { useEffect, useState } from 'react';
import { PelletBoilerRequests } from '../api';
import { PelletBoilerReading } from '../types';
import { downloadText, formatNumber, formatTime, readingsToCsv, stateName, todayWarsaw } from '../utils/boiler';
import './style.css';

const yesNo = (value?: boolean) => value === undefined ? '---' : value ? 'tak' : 'nie';

export const PelletBoilerData: React.FC = () => {
  const [date, setDate] = useState(todayWarsaw());
  const [readings, setReadings] = useState<PelletBoilerReading[] | null>(null);

  useEffect(() => {
    setReadings(null);
    PelletBoilerRequests.getList(date).then((result) => setReadings(result ?? []));
  }, [date]);

  return (
    <div className="settings boiler-page">
      <h2>Dane</h2>
      <section>
        <div className="resource">
          <div className="boiler-toolbar">
            <label>Dane na dzień:{' '}
              <input type="date" value={date} onChange={(event) => event.currentTarget.value && setDate(event.currentTarget.value)} />
            </label>
            <button className="boiler-toolbar-end" type="button" disabled={!readings?.length}
              onClick={() => readings && downloadText(readingsToCsv(readings), `kociol-${date}.csv`)}>
              CSV
            </button>
          </div>

          {readings === null && <div>Wczytywanie…</div>}
          {readings?.length === 0 && <div>Brak odczytów w tym dniu.</div>}
          {readings && readings.length > 0 && (
            <div className="boiler-table-scroll">
              <table className="boiler-table">
                <thead>
                  <tr>
                    <th>Czas</th><th>Stan</th><th>Kocioł</th><th>CWU</th><th>Zewn.</th><th>Spaliny</th>
                    <th>Powrót</th><th>Paliwo %</th><th>Went. %</th><th>Moc kW</th><th>Pompa CO</th><th>Pompa CWU</th>
                  </tr>
                </thead>
                <tbody>
                  {readings.map((r, index) => (
                    <tr key={r.createdAt ?? index}>
                      <td>{formatTime(r.createdAt)}</td>
                      <td>{stateName(r.state)}</td>
                      <td>{formatNumber(r.heating_temp)}</td>
                      <td>{formatNumber(r.water_heater_temp)}</td>
                      <td>{formatNumber(r.outside_temp)}</td>
                      <td>{formatNumber(r.exhaust_temp)}</td>
                      <td>{formatNumber(r.return_temp)}</td>
                      <td>{formatNumber(r.fuel_level, 0)}</td>
                      <td>{formatNumber(r.fan_power, 0)}</td>
                      <td>{formatNumber(r.boiler_power)}</td>
                      <td>{yesNo(r.heating_pump)}</td>
                      <td>{yesNo(r.water_heater_pump)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
