// Zakładka Dane kotła pelletowego (/data): odczyty z wybranego dnia (GET /pellet-boiler-pelux200/list)
// z eksportem CSV. Najpierw główne kolumny (kocioł, CWU, mieszacze, pompy), reszta po „Pokaż wszystkie
// parametry”; CSV ma zawsze wszystkie. Dane pobierane przy wejściu i zmianie daty, bez odświeżania.
import { useEffect, useState } from 'react';
import { PelletBoilerRequests } from '../api';
import { PelletBoilerReading } from '../types';
import { READING_COLUMNS, downloadText, readingsToCsv, todayWarsaw } from '../utils/boiler';
import './style.css';

export const PelletBoilerData: React.FC = () => {
  const [date, setDate] = useState(todayWarsaw());
  const [readings, setReadings] = useState<PelletBoilerReading[] | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    setReadings(null);
    PelletBoilerRequests.getList(date).then((result) => setReadings(result ?? []));
  }, [date]);

  const columns = READING_COLUMNS.filter((column) => showAll || column.main);

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
            <>
              <div className="boiler-table-scroll">
                <table className="boiler-table">
                  <thead>
                    <tr>{columns.map((column) => <th key={column.key}>{column.header}</th>)}</tr>
                  </thead>
                  <tbody>
                    {readings.map((r, index) => (
                      <tr key={r.createdAt ?? index}>
                        {columns.map((column) => <td key={column.key}>{column.cell(r)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="boiler-actions boiler-data-more">
                <button type="button" onClick={() => setShowAll(!showAll)}>
                  {showAll ? 'Pokaż główne parametry' : 'Pokaż wszystkie parametry'}
                </button>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
};
