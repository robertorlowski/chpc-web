import { FormEvent, useEffect, useState } from 'react';
import { WaterRequests } from '../../api/api';
import { WaterMeterReading, WaterPressureRun } from '../../api/type';
import {
  compressorSeconds, downloadText, formatDate, formatLiters, formatTime, monthBounds,
  pumpSeconds, runsToCsv, sumWater, todayWarsaw,
} from '../../utils/water';
import './style.css';

type View = 'runs' | 'meter';

const TABS: { value: View; label: string }[] = [
  { value: 'runs', label: 'Uruchomienia pompy' },
  { value: 'meter', label: 'Odczyty wodomierza' },
];

// Zakładka Dane hydroforu: uruchomienia pompy z miesiąca i odczyty wodomierza.
// Porównanie wodomierza z szacunkiem jest na Wykresie (Rok).
export const WaterData: React.FC = () => {
  const [view, setView] = useState<View>('runs');

  return (
    <div className="settings water-page">
      <h2>Dane</h2>
      <div className="water-tabs" role="tablist">
        {TABS.map((tab) => (
          <button key={tab.value} type="button" role="tab" aria-selected={view === tab.value}
            className={view === tab.value ? 'active' : ''} onClick={() => setView(tab.value)}>
            {tab.label}
          </button>
        ))}
      </div>
      <section>
        {view === 'runs' ? <RunsView /> : <MeterView />}
      </section>
    </div>
  );
};

function RunsView() {
  const [month, setMonth] = useState(todayWarsaw().slice(0, 7));
  const [runs, setRuns] = useState<WaterPressureRun[] | null>(null);

  useEffect(() => {
    setRuns(null);
    WaterRequests.getRuns(monthBounds(month).from, monthBounds(month).to).then((result) => setRuns(result ?? []));
  }, [month]);

  return (
    <div className="resource">
      <div className="water-toolbar">
        <label className="water-field">Dane na miesiąc:
          <input type="month" value={month} onChange={(event) => event.currentTarget.value && setMonth(event.currentTarget.value)} />
        </label>
        <button
          className="water-toolbar-end"
          type="button"
          disabled={!runs?.length}
          onClick={() => runs && downloadText(runsToCsv(runs), `hydrofor-${month}.csv`)}
        >
          CSV
        </button>
      </div>

      {runs === null && <div>Wczytywanie…</div>}
      {runs?.length === 0 && <div>Brak uruchomień w tym okresie.</div>}
      {runs && runs.length > 0 && (
        <>
          <table className="water-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Start</th>
                <th>Kompresor [s]</th>
                <th>Pompa [s]</th>
                <th>Woda [l]</th>
              </tr>
            </thead>
            <tbody>
              {[...runs].reverse().map((run) => (
                <tr key={run._id} className={run.inProgress ? 'water-run-active' : ''}>
                  <td>{formatDate(run.pumpStart)}</td>
                  <td title={run.timeApproximate ? 'Czas przybliżony: uruchomienie bez sieci' : undefined}>
                    {run.timeApproximate ? '≈ ' : ''}{formatTime(run.pumpStart)}
                  </td>
                  <td>{compressorSeconds(run) ?? '---'}</td>
                  <td>{pumpSeconds(run)}</td>
                  <td>{formatLiters(run.waterLiters)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="water-total">
            Razem: <strong>{formatLiters(sumWater(runs))} l</strong> w {runs.length} uruchomieniach
          </div>
        </>
      )}
    </div>
  );
}

// Odczyt wodomierza ma samą datę; zapisywany jest jako południe czasu lokalnego,
// żeby w każdej strefie wypadał tego samego dnia.
const readingDate = (date: string) => new Date(`${date}T12:00:00`).toISOString();

function MeterView() {
  const [readings, setReadings] = useState<WaterMeterReading[]>([]);
  const [readAt, setReadAt] = useState(todayWarsaw());
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const loadReadings = () => WaterRequests.getMeterReadings().then((list) => list && setReadings(list));
  useEffect(() => { loadReadings(); }, []);

  const add = async (event: FormEvent) => {
    event.preventDefault();
    const valueM3 = Number(value.replace(',', '.'));
    if (!readAt) {
      setError('Podaj datę odczytu.');
      return;
    }
    if (!value.trim() || !Number.isFinite(valueM3) || valueM3 < 0) {
      setError('Podaj stan wodomierza w m³.');
      return;
    }
    setError('');
    const response = await WaterRequests.addMeterReading({ readAt: readingDate(readAt), valueM3, note });
    if (!response || !response.ok) {
      setError('Nie udało się zapisać odczytu.');
      return;
    }
    setValue('');
    setNote('');
    loadReadings();
  };

  const remove = async (reading: WaterMeterReading) => {
    if (!window.confirm(`Usunąć odczyt ${formatDate(reading.readAt)} (${reading.valueM3} m³)?`)) return;
    try {
      await WaterRequests.deleteMeterReading(reading._id);
      loadReadings();
    } catch {
      setError('Nie udało się usunąć odczytu.');
    }
  };

  return (
    <>
      <div className="resource">
        <h3 className="settings-section-title">Nowy odczyt</h3>
        <form className="water-form water-form-left" onSubmit={add}>
          <label className="water-field">
            <span className="label">Data:</span>
            <input type="date" value={readAt} onChange={(event) => setReadAt(event.currentTarget.value)} />
          </label>
          <label className="water-field">
            <span className="label">Stan [m³]:</span>
            <input type="text" inputMode="decimal" value={value} placeholder="np. 123,456"
              onChange={(event) => setValue(event.currentTarget.value)} />
          </label>
          <label className="water-field water-field-wide">
            <span className="label">Uwagi:</span>
            <input type="text" value={note} onChange={(event) => setNote(event.currentTarget.value)} />
          </label>
          {error && <div className="water-error">{error}</div>}
          <div className="water-actions"><button type="submit">Dodaj odczyt</button></div>
        </form>
      </div>

      <div className="resource">
        <h3 className="settings-section-title">Odczyty</h3>
        {readings.length === 0 && <div>Brak odczytów.</div>}
        {readings.length > 0 && (
          <table className="water-table">
            <thead>
              <tr><th>Data</th><th>Stan [m³]</th><th>Zużycie [l]</th><th></th></tr>
            </thead>
            <tbody>
              {[...readings].reverse().map((reading, index, list) => {
                const previous = list[index + 1];
                return (
                  <tr key={reading._id} title={reading.note || undefined}>
                    <td>{formatDate(reading.readAt)}</td>
                    <td>{reading.valueM3.toLocaleString('pl-PL', { maximumFractionDigits: 3 })}</td>
                    <td>{previous ? formatLiters((reading.valueM3 - previous.valueM3) * 1000) : '---'}</td>
                    <td>
                      <button type="button" className="water-secondary" onClick={() => remove(reading)}
                        aria-label="Usuń odczyt" title="Usuń odczyt">×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
