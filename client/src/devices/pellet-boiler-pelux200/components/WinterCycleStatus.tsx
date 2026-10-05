// Stan cyklu Zimy w trybie pompy ciepła (serwer: pellet-boiler-pelux200-winter-cycle.service.ts), w Ustawieniach
// przy przycisku Lato / Zima i w Harmonogramie: Zima przy kotle ≥ 40 °C, Lato przy < 30 °C i stojącej pompie CO.
import { PelletBoilerWinterCycle } from '../types';
import { formatDateTime, formatNumber } from '../utils/boiler';

const time = (value?: string | null) =>
  value ? new Date(value).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) : '';

export function WinterCycleStatus({ cycle }: { cycle?: PelletBoilerWinterCycle | null }) {
  if (!cycle) return null;
  const temperature = cycle.temperature === null ? 'brak świeżego odczytu' : `teraz ${formatNumber(cycle.temperature)} °C`;
  return (
    <div className="boiler-hint boiler-winter-cycle">
      {cycle.phase === 'waiting'
        ? <>Zima z pompą ciepła: kocioł na Lecie czeka na 40 °C ({temperature}) od {formatDateTime(cycle.since)}
          {cycle.forcedAt ? `; wymuszony start pompy ciepła ${time(cycle.forcedAt)}` : ''}.</>
        : <>Zima z pompą ciepła: kocioł na Zimie; Lato, gdy spadnie poniżej 30 °C i stanie pompa CO ({temperature}).</>}
    </div>
  );
}
