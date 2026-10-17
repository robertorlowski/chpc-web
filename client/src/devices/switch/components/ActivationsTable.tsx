// Tabela włączeń przekaźników (widok główny „Dziś” i zakładka Dane): przekaźnik (przy więcej niż jednym),
// od, do (trwające jako „trwa”, przybliżony koniec z „≈”), czas i źródło. Układ table.data z makiety „Instrument”
// w .table-wrap, więc na telefonie przewija się sama tabela, nie strona.
import { SwitchActivation } from '../types';
import { activationSourceLabel, formatDuration } from '../utils/format';

export const ActivationsTable: React.FC<{
  activations: SwitchActivation[];
  names: Map<number, string>;
  /** kolumna „Przekaźnik” tylko przy więcej niż jednym przekaźniku */
  showRelay: boolean;
  /** chwila w kolumnie „Od” / „Do” (godzina, a dla innego dnia także data) */
  moment: (iso: string) => string;
}> = ({ activations, names, showRelay, moment }) => (
  <div className="table-wrap">
    <table className="data">
      <thead>
        <tr>
          {showRelay && <th>Przekaźnik</th>}
          <th>Od</th>
          <th>Do</th>
          <th className="num">Czas</th>
          <th>Źródło</th>
        </tr>
      </thead>
      <tbody>
        {activations.map((activation) => (
          <tr key={activation._id}>
            {showRelay && <td>{names.get(activation.relay) ?? `Przekaźnik ${activation.relay}`}</td>}
            <td>{moment(activation.onAt)}</td>
            <td title={activation.approximate ? 'Czas przybliżony: sterownik stracił zasilanie albo łączność' : undefined}>
              {activation.offAt ? `${activation.approximate ? '≈ ' : ''}${moment(activation.offAt)}` : <em>trwa</em>}
            </td>
            <td className="num">{activation.offAt ? formatDuration(activation.durationS) : <em>w toku</em>}</td>
            <td>{activationSourceLabel(activation.source)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
