// Tabela włączeń przekaźników (widok główny „Dziś” i zakładka Dane): przekaźnik (przy więcej niż jednym),
// od, do (trwające jako „trwa”, przybliżony koniec z „≈”), czas i źródło. Układ table.data z makiety „Instrument”
// w .table-wrap, więc na telefonie przewija się sama tabela, nie strona.
import { SwitchActivation } from '../types';
import { activationSourceLabel, formatDuration } from '../utils/format';
import { useLang } from '../../../core/i18n';

export const ActivationsTable: React.FC<{
  activations: SwitchActivation[];
  names: Map<number, string>;
  /** kolumna „Przekaźnik” tylko przy więcej niż jednym przekaźniku */
  showRelay: boolean;
  /** chwila w kolumnie „Od” / „Do” (godzina, a dla innego dnia także data) */
  moment: (iso: string) => string;
}> = ({ activations, names, showRelay, moment }) => {
  const { t } = useLang();
  return (
  <div className="table-wrap">
    <table className="data">
      <thead>
        <tr>
          {showRelay && <th>{t('sw.relay')}</th>}
          <th>{t('sw.table.from')}</th>
          <th>{t('sw.table.to')}</th>
          <th className="num">{t('sw.table.duration')}</th>
          <th>{t('sw.table.source')}</th>
        </tr>
      </thead>
      <tbody>
        {activations.map((activation) => (
          <tr key={activation._id}>
            {showRelay && <td>{names.get(activation.relay) ?? t('switch.relay', { n: activation.relay })}</td>}
            <td>{moment(activation.onAt)}</td>
            <td title={activation.approximate ? t('sw.table.approximateTip') : undefined}>
              {activation.offAt ? `${activation.approximate ? '≈ ' : ''}${moment(activation.offAt)}` : <em>{t('sw.table.ongoing')}</em>}
            </td>
            <td className="num">{activation.offAt ? formatDuration(activation.durationS) : <em>{t('sw.table.inProgress')}</em>}</td>
            <td>{activationSourceLabel(activation.source)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
  );
};
