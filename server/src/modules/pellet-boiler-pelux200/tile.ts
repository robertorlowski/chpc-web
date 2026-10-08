// Kafelek kotła Pellux 200 na stronie /devices (GET /devices/summary): stan regulatora, temperatura kotła
// i CWU z zadanymi, tryb pracy, poziom pelletu i moc. Błąd (czerwony): aktywny alarm regulatora albo brak
// odczytu dłużej niż godzinę (od 3 odstępów odpytywania do godziny to uwaga, pomarańczowa). Ostrzeżenie (pomarańczowy): mało pelletu (< 15 %) albo ostatnie
// zlecenie zmiany parametru zakończone błędem w ciągu doby.
import { Device, DeviceTile } from '../../core/types';
import { formatTemperature, formatUnit, formatWhen, offlineLevel } from '../../core/services/tile-format';
import { PelletBoilerCommandModel } from './models/pellet-boiler-pelux200-command.model';
import { PelletBoilerSettingsEntry, PelletBoilerSettingsModel } from './models/pellet-boiler-pelux200-settings.model';
import { listAlerts } from './services/pellet-boiler-pelux200-alert.service';
import { effectiveBoilerMode } from './services/pellet-boiler-pelux200-heat-pump-link.service';
import { getPelletBoilerPelux200Last, getPollIntervalSeconds, readingResponding } from './services/pellet-boiler-pelux200.service';
import { PelletBoilerPelux200Entry } from './types';

// stany z płomieniem (jak w kliencie): stabilizacja, rozpalanie, praca, nadzór, wygaszanie
const FLAME_STATES = new Set([1, 2, 3, 4, 7]);
export const LOW_FUEL_PERCENT = 15;
const COMMAND_ERROR_WINDOW_MS = 24 * 3600 * 1000;

const target = (value?: number) => (typeof value === 'number' ? ` → ${value}` : '');

export async function pelletBoilerTile(rootId: string, _device: Device, now = new Date()): Promise<DeviceTile | null> {
  const last = await getPelletBoilerPelux200Last(rootId) as (PelletBoilerPelux200Entry & { createdAt?: Date }) | undefined;
  if (!last?.createdAt) return { level: 'off', chip: 'Brak danych' };

  const at = new Date(last.createdAt);
  const [pollSeconds, settings, alerts, failed] = await Promise.all([
    getPollIntervalSeconds(rootId),
    PelletBoilerSettingsModel.findOne({ rootId }).lean<PelletBoilerSettingsEntry>(),
    listAlerts(rootId),
    PelletBoilerCommandModel
      .findOne({ rootId, status: { $in: ['done', 'error'] } }).sort({ doneAt: -1 })
      .lean<{ status: string; label?: string; doneAt?: Date }>(),
  ]);
  const mode = await effectiveBoilerMode(rootId, settings);
  const activeAlerts = alerts.alerts.filter((alert) => alert.active);
  const alarm = activeAlerts.length > 0 || last.alarm === true || last.state === 8;
  const responding = readingResponding(at, pollSeconds, now.getTime());

  let level: DeviceTile['level'] = 'ok';
  let note: DeviceTile['note'];
  // chip: Online / Offline (jak na wszystkich kafelkach); palenie = niebieski chip (running)
  let chip = 'Online';
  if (!responding) {
    const age = now.getTime() - at.getTime();
    level = offlineLevel(age); // do godziny uwaga, potem błąd
    chip = 'Offline';
  } else if (alarm) {
    level = 'err';
    const code = activeAlerts[0]?.code;
    note = { level: 'err', text: `Regulator zgłasza alarm kotła${code !== undefined ? ` (kod ${code})` : ''}` };
  } else if (typeof last.fuel_level === 'number' && last.fuel_level < LOW_FUEL_PERCENT) {
    level = 'warn';
    note = { level: 'warn', text: `Mało pelletu (${formatUnit(last.fuel_level, '%')})` };
  } else if (failed?.status === 'error' && failed.doneAt && now.getTime() - new Date(failed.doneAt).getTime() < COMMAND_ERROR_WINDOW_MS) {
    level = 'warn';
    note = { level: 'warn', text: `Zmiana „${failed.label ?? 'parametru'}” nie powiodła się (${formatWhen(new Date(failed.doneAt), now)})` };
  }

  const row = [];
  if (mode) row.push({ icon: 'sliders' as const, value: mode === 'heat-pump' ? 'Pompa ciepła' : 'Pellet', label: '' });
  if (typeof last.fuel_level === 'number') row.push({ icon: 'pellet' as const, value: formatUnit(last.fuel_level, '%'), label: 'pellet' });
  if ((last.boiler_power ?? 0) > 0) row.push({ icon: 'bolt' as const, value: formatUnit(last.boiler_power, 'kW', 1), label: '' });

  return {
    level,
    chip,
    running: level !== 'err' && last.state !== undefined && FLAME_STATES.has(last.state),
    main: { icon: 'flame', value: formatTemperature(last.heating_temp), label: `kocioł${target(last.heating_target)}` },
    side: [{ icon: 'tap', value: formatTemperature(last.water_heater_temp), label: `CWU${target(last.water_heater_target)}` }],
    row,
    note,
    updatedAt: at.toISOString(),
  };
}
