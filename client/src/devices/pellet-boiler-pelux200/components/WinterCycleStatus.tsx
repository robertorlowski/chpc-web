// Stan cyklu Zimy w trybie pompy ciepła (serwer: pellet-boiler-pelux200-winter-cycle.service.ts), w Ustawieniach
// przy przycisku Lato / Zima i w Harmonogramie: Zima przy kotle albo pompie (HP.Ttarget) ≥ max pompy ciepła − 3 °C, Lato przy < 30 °C i stojącej pompie CO.
import { PelletBoilerWinterCycle } from '../types';
import { formatDateTime, formatNumber } from '../utils/boiler';

const time = (value?: string | null) =>
  value ? new Date(value).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) : '';

export function WinterCycleStatus({ cycle }: { cycle?: PelletBoilerWinterCycle | null }) {
  if (!cycle) return null;
  const temperature = cycle.temperature === null ? 'brak świeżego odczytu' : `teraz ${formatNumber(cycle.temperature)} °C`;
  const pump = typeof cycle.pumpTemperature === 'number' ? `, pompa ${formatNumber(cycle.pumpTemperature)} °C` : '';
  return (
    <div className="boiler-hint boiler-winter-cycle">
      {cycle.phase === 'waiting'
        ? <>Zima z pompą ciepła: kocioł na Lecie czeka na {formatNumber(cycle.winterFrom ?? 45)} °C w kotle albo na pompie ({temperature}{pump}) od {formatDateTime(cycle.since)}
          {cycle.forcedAt ? `; wymuszony start pompy ciepła ${time(cycle.forcedAt)}` : ''}.</>
        : <>Zima z pompą ciepła: kocioł na Zimie; Lato, gdy spadnie poniżej 30 °C i stanie pompa CO ({temperature}).</>}
      {cycle.mixer && <>
        {' '}Mieszacz 1 obniżony do {formatNumber(cycle.mixer.lowered)} °C, wróci do {formatNumber(cycle.mixer.saved)} °C
        {` na Zimie, gdy woda w pompie ciepła wróci do ${formatNumber(cycle.mixer.restoreFrom ?? 40)} °C`}
        {typeof cycle.mixer.reference === 'number'
          ? `, utrzyma ${formatNumber(cycle.mixer.reference)} °C przez 15 min (od ${time(cycle.mixer.referenceAt)})`
            + ` albo wzrośnie do ${formatNumber(cycle.mixer.reference + 5)} °C${pump ? ` (${pump.slice(2)})` : ''}`
          : ', utrzyma temperaturę przez 15 min albo wzrośnie o 5 °C'}.
      </>}
    </div>
  );
}
