// Zakładka Dane hydroforu (/data) w układzie makiety „Instrument” (#s-tank-dane): przełącznik
// „Uruchomienia pompy” / „Odczyty wodomierza”, nawigacja po miesiącu i CSV w pasku filtrów; tabela uruchomień
// z miesiąca (z „≈” i chipem „z kolejki” przy czasie przybliżonym) albo karta odczytów wodomierza: formularz
// (data, stan, uwagi) i lista z przyrostem, czasem pompy i przepływem okresu (GET /water-pressure-tank/meter/summary).
// Dane pobierane przy wejściu i zmianie miesiąca, bez odświeżania cyklicznego.
import { FormEvent, useEffect, useState } from 'react';
import { IconButton } from '../../../core/components/IconButton';
import { TrashIcon } from '../../../core/components/icons';
import { WaterPressureTankRequests } from '../api';
import { WaterMeterReading, WaterMeterSummary, WaterPressureTankRun } from '../types';
import {
  compressorSeconds, downloadText, formatDate, formatDuration, formatLiters, formatTime, monthBounds, monthLabel,
  runsToCsv, shiftMonth, sumPumpSeconds, sumWater, todayWarsaw,
} from '../utils/water';
import { DateNav } from '../components/DateNav';
import { DownloadIcon } from '../components/TankIcons';
import './style.css';

type View = 'runs' | 'meter';

const TABS: { value: View; label: string }[] = [
  { value: 'runs', label: 'Uruchomienia pompy' },
  { value: 'meter', label: 'Odczyty wodomierza' },
];

const plural = (count: number, one: string, few: string, many: string) => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (count === 1) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

// Zakładka Dane hydroforu: uruchomienia pompy z miesiąca i odczyty wodomierza.
// Porównanie wodomierza z szacunkiem jest na Wykresie (Rok).
export const WaterPressureTankData: React.FC = () => {
  const [view, setView] = useState<View>('runs');
  const [month, setMonth] = useState(todayWarsaw().slice(0, 7));
  const [runs, setRuns] = useState<WaterPressureTankRun[] | null>(null);
  const currentMonth = todayWarsaw().slice(0, 7);

  useEffect(() => {
    setRuns(null);
    WaterPressureTankRequests.getRuns(monthBounds(month).from, monthBounds(month).to).then((result) => setRuns(result ?? []));
  }, [month]);

  return (
    <main className="page page-device tank-page">
      <div className="filters">
        <div className="segmented seg-inline" role="radiogroup" aria-label="Zakres">
          {TABS.map((tab) => (
            <label key={tab.value} className="seg">
              <input type="radio" name="tank-data-view" checked={view === tab.value} onChange={() => setView(tab.value)} />
              <span>{tab.label}</span>
            </label>
          ))}
        </div>
        {view === 'runs' && (
          <>
            <DateNav label={monthLabel(month)} unit="miesiąc" onPrev={() => setMonth(shiftMonth(month, -1))}
              onNext={() => setMonth(shiftMonth(month, 1))} nextDisabled={month >= currentMonth} />
            <button type="button" className="btn btn-ghost btn-sm" disabled={!runs?.length}
              onClick={() => runs && downloadText(runsToCsv(runs), `hydrofor-${month}.csv`)}>
              <DownloadIcon />CSV
            </button>
          </>
        )}
      </div>
      {view === 'runs' ? <RunsCard runs={runs} /> : <MeterCard />}
    </main>
  );
};

function RunsCard({ runs }: { runs: WaterPressureTankRun[] | null }) {
  const water = runs ? sumWater(runs) : null;
  return (
    <section className="card card-table">
      <header className="card-head">
        <h2>Uruchomienia w miesiącu</h2>
        {runs && runs.length > 0 && (
          <span className="card-hint">
            {water !== null && <>razem {formatLiters(Math.round(water))} l · </>}
            pompa {formatDuration(sumPumpSeconds(runs))} · {runs.length} {plural(runs.length, 'uruchomienie', 'uruchomienia', 'uruchomień')}
          </span>
        )}
      </header>
      {runs === null && <p className="help">Wczytywanie…</p>}
      {runs?.length === 0 && <p className="help">Brak uruchomień w tym miesiącu.</p>}
      {runs && runs.length > 0 && (
        <>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>Data</th><th>Godzina</th><th className="num">Kompresor</th><th className="num">Pompa</th><th className="num">Woda</th><th>Uwagi</th></tr>
              </thead>
              <tbody>
                {[...runs].reverse().map((run) => (
                  <tr key={run._id}>
                    <td>{formatDate(run.pumpStart)}</td>
                    <td title={run.timeApproximate ? 'Czas przybliżony: uruchomienie bez sieci' : undefined}>
                      {run.timeApproximate ? '≈ ' : ''}{formatTime(run.pumpStart)}
                    </td>
                    <td className="num">{compressorSeconds(run) !== undefined ? `${compressorSeconds(run)} s` : '—'}</td>
                    <td className="num" title={run.manualSeconds ? `Bez ${run.manualSeconds} s ręcznej pracy kompresora` : undefined}>
                      {run.inProgress ? <em>{formatDuration(run.pumpSeconds)} …</em> : formatDuration(run.pumpSeconds)}
                    </td>
                    <td className="num">{run.waterLiters === null ? '—' : `${formatLiters(Math.round(run.waterLiters))} l`}</td>
                    <td>
                      {run.timeApproximate && <span className="chip chip-off">z kolejki</span>}
                      {run.inProgress && <span className="chip chip-ok">trwa</span>}
                      {!!run.manualSeconds && <span className="chip chip-warn">kompresor ręcznie {run.manualSeconds} s</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <footer className="table-foot">„≈” = czas przybliżony (uruchomienie z kolejki, bez sieci). Pompa bez ręcznej pracy kompresora.</footer>
        </>
      )}
    </section>
  );
}

// Odczyt wodomierza ma samą datę; zapisywany jest jako południe czasu lokalnego,
// żeby w każdej strefie wypadał tego samego dnia.
const readingDate = (date: string) => new Date(`${date}T12:00:00`).toISOString();

const formatM3 = (value: number) => value.toLocaleString('pl-PL', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

// Odczyty wodomierza: formularz i lista od najnowszego; przy każdym odczycie przyrost od poprzedniego, a gdy
// serwer policzył ten okres (meter/summary) — czas pompy i przepływ okresu.
function MeterCard() {
  const [readings, setReadings] = useState<WaterMeterReading[] | null>(null);
  const [summary, setSummary] = useState<WaterMeterSummary | null>(null);
  const [readAt, setReadAt] = useState(todayWarsaw());
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const load = () => {
    WaterPressureTankRequests.getMeterReadings().then((list) => setReadings(list ?? []));
    // okresy między odczytami nie zależą od roku (serwer zwraca wszystkie)
    WaterPressureTankRequests.getMeterSummary(Number(todayWarsaw().slice(0, 4))).then((result) => result && setSummary(result));
  };
  useEffect(() => { load(); }, []);

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
    const response = await WaterPressureTankRequests.addMeterReading({ readAt: readingDate(readAt), valueM3, note });
    if (!response || !response.ok) {
      setError('Nie udało się zapisać odczytu.');
      return;
    }
    setValue('');
    setNote('');
    load();
  };

  const remove = async (reading: WaterMeterReading) => {
    if (!window.confirm(`Usunąć odczyt ${formatDate(reading.readAt)} (${reading.valueM3} m³)?`)) return;
    try {
      await WaterPressureTankRequests.deleteMeterReading(reading._id);
      load();
    } catch {
      setError('Nie udało się usunąć odczytu.');
    }
  };

  const periodFor = (reading: WaterMeterReading) =>
    summary?.periods.find((period) => new Date(period.to).getTime() === new Date(reading.readAt).getTime());

  return (
    <section className="card">
      <header className="card-head"><h2>Odczyty wodomierza</h2><span className="card-hint">z nich liczony jest przepływ</span></header>
      <form className="form-row" onSubmit={add}>
        <div className="range-inputs tank-meter-inputs">
          <input type="date" value={readAt} aria-label="Data odczytu" onChange={(event) => setReadAt(event.currentTarget.value)} />
          <input type="text" inputMode="decimal" className="w-wide" placeholder="stan m³" aria-label="Stan wodomierza [m³]"
            value={value} onChange={(event) => setValue(event.currentTarget.value)} />
          <span className="unit-txt">m³</span>
          <input type="text" className="w-text" placeholder="uwagi (opcjonalnie)" aria-label="Uwagi"
            value={note} onChange={(event) => setNote(event.currentTarget.value)} />
        </div>
        <button type="submit" className="btn btn-primary btn-sm">Dodaj odczyt</button>
      </form>
      {error && <p className="help danger-text">{error}</p>}
      {readings === null && <p className="help">Wczytywanie…</p>}
      {readings?.length === 0 && <p className="help">Brak odczytów. Po dwóch odczytach z pracą pompy między nimi serwer policzy przepływ i wodę.</p>}
      {readings && readings.length > 0 && (
        <ul className="people">
          {[...readings].reverse().map((reading, index, list) => {
            const previous = list[index + 1];
            const period = periodFor(reading);
            return (
              <li key={reading._id}>
                <span className="person">
                  <strong>{formatDate(reading.readAt)} · {formatM3(reading.valueM3)} m³</strong>
                  <small>
                    {previous
                      ? <>+ {((reading.valueM3 - previous.valueM3)).toLocaleString('pl-PL', { maximumFractionDigits: 2 })} m³ od poprzedniego</>
                      : 'pierwszy odczyt'}
                    {period && period.pumpSeconds > 0 && (
                      <> · pompa {formatDuration(period.pumpSeconds)} · {(period.meterLiters / (period.pumpSeconds / 60)).toLocaleString('pl-PL', { maximumFractionDigits: 1 })} l/min</>
                    )}
                    {reading.note && <> · {reading.note}</>}
                  </small>
                </span>
                <IconButton label="Usuń odczyt" variant="danger" icon={<TrashIcon />} onClick={() => remove(reading)} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
