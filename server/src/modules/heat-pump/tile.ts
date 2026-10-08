// Kafelek pompy ciepła na stronie /devices (GET /devices/summary): stan sprężarki, temperatura zbiornika,
// zakres temperatur, moc i tryb pracy. Błąd (czerwony): blokada po 5 błędach, aktywny błąd albo brak
// telemetrii dłużej niż godzinę (od 5 min do godziny to uwaga, pomarańczowa; co wysyła co 10–30 s, a po utracie
// odpowiedzi CHPC przestaje wysyłać pole HP, więc telemetria przestaje być zapisywana). Ostrzeżenie (pomarańczowy): błąd z ostatnich 24 h,
// który już ustąpił.
import { Device, DeviceTile } from '../../core/types';
import {
  formatAge, formatNumber, formatTemperature, formatUnit, formatWhen, offlineLevel, toNumber,
} from '../../core/services/tile-format';
import { errorDescription } from './error-codes';
import { ERROR_LOCK_LIMIT, getHpLastData, getHpLastError } from './services/hp.service';
import { HpEntry } from './types';

export const OFFLINE_AFTER_MS = 5 * 60 * 1000;

// jak „Tryb pracy” w widoku głównym pompy (co od 1.2.0: MANUAL / AUTO / OFF; starsze: M, A, PV, CWU)
export function modeLabel(workMode?: string): string {
  switch (workMode) {
    case 'OFF': return 'OFF';
    case 'A': case 'AUTO': return 'automatyczny';
    case 'PV': return 'automatyczny z PV';
    case 'CWU': return 'CWU';
    case 'M': case 'MANUAL': return 'ręczny';
    default: return '---';
  }
}

export async function heatPumpTile(rootId: string, _device: Device, now = new Date()): Promise<DeviceTile | null> {
  const last = await getHpLastData(rootId) as HpEntry & { createdAt?: Date };
  if (!last?.createdAt) return { level: 'off', chip: 'Brak danych' };

  const hp = last.HP ?? {};
  const at = new Date(last.createdAt);
  const age = now.getTime() - at.getTime();
  const running = Number(hp.HPS ?? 0) > 0;
  const errorCount = Number(hp.ERRc ?? 0);
  const locked = errorCount >= ERROR_LOCK_LIMIT;
  const error = await getHpLastError(rootId, now) as { error_code?: number; createdAt?: Date };
  const code = error.error_code ?? Number(hp.ERR ?? 0);

  let level: DeviceTile['level'] = 'ok';
  let note: DeviceTile['note'];
  let chip = running ? 'Sprężarka pracuje' : 'Postój';
  if (age > OFFLINE_AFTER_MS) {
    level = offlineLevel(age); // do godziny uwaga, potem błąd
    chip = 'Brak łączności';
    note = { level, text: `Brak telemetrii od ${formatAge(age)}` };
  } else if (locked) {
    level = 'err';
    chip = 'Zablokowana';
    note = { level: 'err', text: `Blokada po ${ERROR_LOCK_LIMIT} błędach.${code ? ` Ostatni: ${code} ${errorDescription(code)}` : ''}` };
  } else if (errorCount > 0 && code) {
    level = 'err';
    note = { level: 'err', text: `Błąd ${code}: ${errorDescription(code)}` };
  } else if (error.error_code && error.createdAt) {
    level = 'warn';
    note = { level: 'warn', text: `Błąd z ostatnich 24 h: ${error.error_code} ${errorDescription(error.error_code)} (${formatWhen(new Date(error.createdAt), now)}), już ustąpił` };
  }

  const side = [];
  // bez łączności stare wartości z pompy nie są pokazywane: zbiornik „---”, brak zakresu temperatur i mocy
  const live = !(age > OFFLINE_AFTER_MS);
  // pamięć podręczna trzyma surową telemetrię (liczby jako napisy), baza liczby: oba warianty przez toNumber
  const tmin = toNumber(hp.Tmin);
  const tmax = toNumber(hp.Tmax);
  if (live && tmin !== undefined && tmax !== undefined) {
    side.push({ icon: 'target' as const, value: `${formatNumber(tmin, 1)}–${formatNumber(tmax, 1)} °C`, label: 'min–max' });
  }
  const watts = toNumber(hp.Watts);
  if (live && running && watts !== undefined) side.push({ icon: 'bolt' as const, value: formatUnit(watts, 'W'), label: '' });

  return {
    level,
    chip,
    running: running && level !== 'err',
    main: { icon: 'thermo', value: live ? formatTemperature(toNumber(hp.Ttarget)) : '---', label: 'zbiornik' },
    side,
    row: [{ icon: 'sliders', value: modeLabel(last.work_mode as string | undefined), label: '' }],
    note,
    updatedAt: at.toISOString(),
  };
}
