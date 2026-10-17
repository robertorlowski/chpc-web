// Przepływ pompy hydroforu (GET /water-pressure-tank/flow) w Ustawieniach: kafelki KPI z makiety
// (przepływ, liczba okresów, woda z wodomierza, czas pompy) i z czego policzono, a bez dwóch odczytów
// wodomierza — co zrobić.
import { WaterFlow } from '../types';
import { formatLiters } from '../utils/water';
import { DurationValue } from './DurationValue';

export const FlowDetails: React.FC<{ flow: WaterFlow | null }> = ({ flow }) => {
  if (!flow) return <p className="help">Wczytywanie…</p>;
  if (flow.litersPerMinute === null) {
    return (
      <p className="help">
        Brak przepływu: wpisz co najmniej dwa odczyty wodomierza (Dane → Odczyty wodomierza), między którymi
        pracowała pompa. Do tego czasu ilość wody nie jest liczona.
      </p>
    );
  }
  return (
    <>
      <div className="hero-kpis kpis-plain">
        <div className="kpi">
          <span className="kpi-label">Przepływ</span>
          <span className="kpi-value">{flow.litersPerMinute.toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}<small>l/min</small></span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Okresy</span>
          <span className="kpi-value">{flow.periods}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Woda z wodomierza</span>
          <span className="kpi-value">{(flow.meterLiters / 1000).toLocaleString('pl-PL', { maximumFractionDigits: 2 })}<small>m³</small></span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Czas pompy</span>
          <span className="kpi-value"><DurationValue seconds={flow.pumpSeconds} /></span>
        </div>
      </div>
      <p className="help">
        Średnia ważona czasem ze wszystkich okresów między odczytami wodomierza ({formatLiters(flow.meterLiters)} l
        w {flow.periods} {flow.periods === 1 ? 'okresie' : 'okresach'}, bez ręcznej pracy kompresora).
        Nowy odczyt zmienia przepływ, a więc i wodę w historii.
      </p>
    </>
  );
};
