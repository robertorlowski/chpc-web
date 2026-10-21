// Stan cyklu Zimy w trybie pompy ciepła (serwer: pellet-boiler-pelux200-winter-cycle.service.ts), w Ustawieniach
// przy przełączniku Lato / Zima i w Harmonogramie (akapit pomocniczy .help): Zima przy kotle albo pompie (HP.Ttarget)
// ≥ max pompy ciepła − 3 °C, Lato przy < 30 °C i stojącej pompie CO.
import { PelletBoilerWinterCycle } from '../types';
import { formatDateTime, formatNumber } from '../utils/boiler';
import { useLang } from '../../../core/i18n';

export function WinterCycleStatus({ cycle }: { cycle?: PelletBoilerWinterCycle | null }) {
  const { t, locale } = useLang();
  if (!cycle) return null;
  const time = (value?: string | null) => (value ? new Date(value).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : '');
  const temperature = cycle.temperature === null ? t('pb.wc.noFresh') : t('pb.wc.now', { value: formatNumber(cycle.temperature) });
  const pump = typeof cycle.pumpTemperature === 'number' ? t('pb.wc.pump', { value: formatNumber(cycle.pumpTemperature) }) : '';
  return (
    <p className="help boiler-winter-cycle">
      {cycle.phase === 'waiting'
        ? <>{t('pb.wc.waiting', { from: formatNumber(cycle.winterFrom ?? 45), temperature, pump, since: formatDateTime(cycle.since) })}
          {cycle.forcedAt ? t('pb.wc.forced', { time: time(cycle.forcedAt) }) : ''}.</>
        : <>{t('pb.wc.winter', { temperature })}</>}
      {cycle.mixer && <>
        {' '}{t('pb.wc.mixer', { lowered: formatNumber(cycle.mixer.lowered), saved: formatNumber(cycle.mixer.saved), restore: formatNumber(cycle.mixer.restoreFrom ?? 40) })}
        {typeof cycle.mixer.reference === 'number'
          ? t('pb.wc.mixerRef', { ref: formatNumber(cycle.mixer.reference), time: time(cycle.mixer.referenceAt), plus: formatNumber(cycle.mixer.reference + 5), pump: pump ? ` (${pump.slice(2)})` : '' })
          : t('pb.wc.mixerNoRef')}.
      </>}
    </p>
  );
}
