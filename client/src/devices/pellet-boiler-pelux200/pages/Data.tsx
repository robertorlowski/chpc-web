// Zakładka Dane kotła pelletowego (/data): odczyty z wybranego dnia (GET /pellet-boiler-pelux200/list)
// z eksportem CSV. Najpierw główne kolumny (kocioł, CWU, mieszacze, pompy), reszta po zaznaczeniu „Pokaż
// wszystkie parametry” nad tabelą (domyślnie odznaczone); CSV ma zawsze wszystkie. Dane pobierane przy wejściu
// i zmianie daty, bez odświeżania. Karta na całe okno (useFillHeight, klasa fill-page): tabela przewija się
// w obu kierunkach z zablokowanym wierszem nagłówka i kolumną „Czas”.
import { useEffect, useState } from 'react';
import { useFillHeight } from '../../../core/components/useFillHeight';
import { PelletBoilerRequests } from '../api';
import { PelletBoilerReading } from '../types';
import { READING_COLUMNS, downloadText, readingsToCsv, todayWarsaw } from '../utils/boiler';
import './style.css';

export const PelletBoilerData: React.FC = () => {
  const cardRef = useFillHeight<HTMLDivElement>();
  const [date, setDate] = useState(todayWarsaw());
  const [readings, setReadings] = useState<PelletBoilerReading[] | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    setReadings(null);
    PelletBoilerRequests.getList(date).then((result) => setReadings(result ?? []));
  }, [date]);

  const columns = READING_COLUMNS.filter((column) => showAll || column.main);

  return (
    <div className="settings boiler-page fill-page">
      <h2>Dane</h2>
      <section>
        <div className="resource" ref={cardRef}>
          <div className="boiler-toolbar">
            <label>Dane na dzień:{' '}
              <input type="date" value={date} onChange={(event) => event.currentTarget.value && setDate(event.currentTarget.value)} />
            </label>
            <button className="boiler-toolbar-end" type="button" disabled={!readings?.length}
              onClick={() => readings && downloadText(readingsToCsv(readings), `kociol-${date}.csv`)}>
              CSV
            </button>
          </div>

          <label className="boiler-data-all">
            <input type="checkbox" checked={showAll} onChange={(event) => setShowAll(event.currentTarget.checked)} />
            Pokaż wszystkie parametry
          </label>

          {readings === null && <div>Wczytywanie…</div>}
          {readings?.length === 0 && <div>Brak odczytów w tym dniu.</div>}
          {readings && readings.length > 0 && (
            <>
              <div className="boiler-table-scroll fill-area">
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
            </>
          )}
        </div>
      </section>
    </div>
  );
};
