// Przepływ pompy hydroforu (GET /water-pressure-tank/flow) na widoku głównym i w Ustawieniach:
// wartość w l/min i z czego ją policzono, a bez dwóch odczytów wodomierza — co zrobić.
import { WaterFlow } from '../types';
import { formatDuration, formatLiters } from '../utils/water';

export const FlowDetails: React.FC<{ flow: WaterFlow | null }> = ({ flow }) => {
  if (!flow) return <div>Wczytywanie…</div>;
  if (flow.litersPerMinute === null) {
    return (
      <div className="water-hint">
        Brak przepływu: wpisz co najmniej dwa odczyty wodomierza (Dane → Odczyty wodomierza), między którymi
        pracowała pompa. Do tego czasu ilość wody nie jest liczona.
      </div>
    );
  }
  return (
    <>
      <div>
        <span className="label">Przepływ pompy:</span>
        <strong>{formatLiters(flow.litersPerMinute)} l/min</strong>
      </div>
      <div className="water-hint">
        Z {flow.periods} {flow.periods === 1 ? 'okresu' : 'okresów'} między odczytami wodomierza:
        {' '}{formatLiters(flow.meterLiters)} l w {formatDuration(flow.pumpSeconds)} pracy pompy
        (bez ręcznej pracy kompresora).
      </div>
    </>
  );
};
