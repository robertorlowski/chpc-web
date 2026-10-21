// Przepływ pompy hydroforu (GET /water-pressure-tank/flow) w Ustawieniach: kafelki KPI z makiety
// (przepływ, liczba okresów, woda z wodomierza, czas pompy) i z czego policzono, a bez dwóch odczytów
// wodomierza — co zrobić.
import { WaterFlow } from '../types';
import { formatLiters } from '../utils/water';
import { DurationValue } from './DurationValue';
import { useLang } from '../../../core/i18n';

export const FlowDetails: React.FC<{ flow: WaterFlow | null }> = ({ flow }) => {
  const { t, tn, locale } = useLang();
  if (!flow) return <p className="help">{t('common.loading')}</p>;
  if (flow.litersPerMinute === null) {
    return <p className="help">{t('wt.flow.none')}</p>;
  }
  return (
    <>
      <div className="hero-kpis kpis-plain">
        <div className="kpi">
          <span className="kpi-label">{t('wt.flow')}</span>
          <span className="kpi-value">{flow.litersPerMinute.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}<small>l/min</small></span>
        </div>
        <div className="kpi">
          <span className="kpi-label">{t('wt.flow.periods')}</span>
          <span className="kpi-value">{flow.periods}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">{t('wt.flow.meterWater')}</span>
          <span className="kpi-value">{(flow.meterLiters / 1000).toLocaleString(locale, { maximumFractionDigits: 2 })}<small>m³</small></span>
        </div>
        <div className="kpi">
          <span className="kpi-label">{t('wt.flow.pumpTime')}</span>
          <span className="kpi-value"><DurationValue seconds={flow.pumpSeconds} /></span>
        </div>
      </div>
      <p className="help">{t('wt.flow.help', { liters: formatLiters(flow.meterLiters), periods: tn('wt.flow.inPeriods', flow.periods) })}</p>
    </>
  );
};
