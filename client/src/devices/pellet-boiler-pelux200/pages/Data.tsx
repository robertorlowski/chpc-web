// Zakładka Dane kotła pelletowego (/data), układ „Instrument” (#s-boiler-dane): odczyty z wybranego dnia
// (GET /pellet-boiler-pelux200/list) z eksportem CSV. Nad kartą pasek filtrów: nawigacja po dniach, znacznik
// „Wszystkie parametry” (domyślnie główne kolumny, CSV zawsze pełny) i przycisk CSV. Karta „Odczyty dnia” z liczbą
// odczytów; tabela (.table-wrap) przewija się w obu kierunkach z przyklejonym nagłówkiem, wysokość do dołu okna
// (.boiler-table-fill w style.css). Dane pobierane przy wejściu i zmianie daty.
import { useEffect, useState } from 'react';
import { PelletBoilerRequests } from '../api';
import { CsvButton, DateNav } from '../components/ui';
import { PelletBoilerReading } from '../types';
import { READING_COLUMNS, downloadText, readingsToCsv, todayWarsaw, withFuelDelta } from '../utils/boiler';
import './style.css';

// kolumny liczbowe wyrównane do prawej (jak w makiecie): wszystkie poza czasem, stanem i flagami
const NUMERIC = new Set(['createdAt', 'state', 'mixer1_valve', 'mixer2_valve']);
const isNumeric = (key: string) => !NUMERIC.has(key) && !['fan', 'feeder', 'lighter', 'circulation_pump', 'alarm', 'heating_pump', 'water_heater_pump', 'mixer1_pump', 'mixer2_pump'].includes(key);

export const PelletBoilerData: React.FC = () => {
  const [date, setDate] = useState(todayWarsaw());
  const [readings, setReadings] = useState<PelletBoilerReading[] | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    setReadings(null);
    PelletBoilerRequests.getList(date).then((result) => setReadings(withFuelDelta(result ?? [])));
  }, [date]);

  const columns = READING_COLUMNS.filter((column) => showAll || column.main);

  return (
    <div className="page page-device boiler-page">
      <div className="filters">
        <DateNav date={date} today={todayWarsaw()} onChange={setDate} />
        <label className="check">
          <input type="checkbox" checked={showAll} onChange={(event) => setShowAll(event.currentTarget.checked)} />
          <span>Wszystkie parametry</span>
          <small>domyślnie główne kolumny; CSV zawsze pełny</small>
        </label>
        <CsvButton disabled={!readings?.length} onClick={() => readings && downloadText(readingsToCsv(readings), `kociol-${date}.csv`)} />
      </div>
      <section className="card card-table">
        <header className="card-head">
          <h2>Odczyty dnia</h2>
          <span className="card-hint">od najnowszego{readings ? ` · ${readings.length} odczytów` : ''}</span>
        </header>
        {readings === null && <span className="help">Wczytywanie…</span>}
        {readings?.length === 0 && <span className="help">Brak odczytów w tym dniu.</span>}
        {readings && readings.length > 0 && (
          <div className="table-wrap boiler-table-fill">
            <table className="data">
              <thead>
                <tr>{columns.map((column) => <th key={column.key} className={isNumeric(column.key) ? 'num' : undefined}>{column.header}</th>)}</tr>
              </thead>
              <tbody>
                {readings.map((r, index) => (
                  <tr key={r.createdAt ?? index} className={r.alarm || r.state === 8 ? 'is-err' : undefined}>
                    {columns.map((column) => <td key={column.key} className={isNumeric(column.key) ? 'num' : undefined}>{column.cell(r)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
