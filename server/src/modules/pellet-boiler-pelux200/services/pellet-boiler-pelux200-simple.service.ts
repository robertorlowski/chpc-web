// Kafelek prosty pieca (lista sterowników, 2026-10-21; makieta: artefakt „Tryb prosty – makieta”, plansze P1–P5).
// Dla osoby, która ma tylko włączać i wyłączać piec: stan w kilku słowach i przyciski „Włącz piec”, „Wyłącz piec”,
// „Włącz CWU” / „Wyłącz CWU”. Akcje składają istniejące mechanizmy:
//   on      — harmonogram włączony (schedule-settings.enabled), zlecenie włącz regulator (control 1, gdy kocioł
//             zgłasza stan 0), CWU włączone (nr 122 = 1 Priorytet, gdy było 0) i Zima: w trybie Pellet nr 125 = 0
//             wprost, w trybie Pompa ciepła przez cykl Zimy (setManualSeason, jak przycisk Zima w Ustawieniach).
//             W trybie pompy ciepła „włącz” rozpalające kocioł jest odrzucane tak jak w Ustawieniach (turnOnCheck, 409).
//   off     — harmonogram zatrzymany i zlecenie wyłącz regulator (control 0), jak „Wyłącz regulator”.
//   cwu-on / cwu-off — nr 122 = 1 / 0.
// Stan (simpleBoilerState) idzie w kafelku (tile.ts, DeviceTile.boiler) i w odpowiedzi na akcję.
import { appUserMeta } from '../../../core/services/operation-log.service';
import { SimpleBoilerState } from '../../../core/types';
import { PelletBoilerCommandModel } from '../models/pellet-boiler-pelux200-command.model';
import { PelletBoilerSettingsEntry, PelletBoilerSettingsModel } from '../models/pellet-boiler-pelux200-settings.model';
import { PelletBoilerCommandChange, PelletBoilerPelux200Entry } from '../types';
import { CommandError, createCommands } from './pellet-boiler-pelux200-command.service';
import { effectiveBoilerMode } from './pellet-boiler-pelux200-heat-pump-link.service';
import { getPelletBoilerPelux200Last, getPollIntervalSeconds, readingResponding } from './pellet-boiler-pelux200.service';
import { getScheduleSettings, saveScheduleSettings, setManualSeason } from './pellet-boiler-pelux200-schedule.service';
import { buildSettingsView } from './pellet-boiler-pelux200-settings.service';
import { describeIgnition, turnOnCheck } from './pellet-boiler-pelux200-turn-on.service';

export type SimpleAction = 'on' | 'off' | 'cwu-on' | 'cwu-off';
export const SIMPLE_ACTIONS: SimpleAction[] = ['on', 'off', 'cwu-on', 'cwu-off'];

// parametry regulatora: zadana CWU, tryb pompy CWU (0 wyłączony, 1 priorytet, 2 bez priorytetu), sezon (0 zima, 1 lato)
const CWU_TARGET = 119;
const CWU_MODE = 122;
const SEASON = 125;
// stany z płomieniem (jak tile.ts i klient)
const FLAME_STATES = new Set([1, 2, 3, 4, 7]);

const parameter = (settings: PelletBoilerSettingsEntry | null, index: number) =>
  settings ? buildSettingsView(settings).groups.flatMap((g) => g.parameters).find((p) => p.index === index)?.raw[0] : undefined;

// Stan dla kafelka prostego: z ostatniego odczytu kotła i ostatniego odczytu ustawień regulatora.
export async function simpleBoilerState(rootId: string, now = new Date()): Promise<SimpleBoilerState> {
  const [last, settings, pollSeconds, pending] = await Promise.all([
    getPelletBoilerPelux200Last(rootId) as Promise<(PelletBoilerPelux200Entry & { createdAt?: Date }) | undefined>,
    PelletBoilerSettingsModel.findOne({ rootId }).lean<PelletBoilerSettingsEntry>(),
    getPollIntervalSeconds(rootId),
    PelletBoilerCommandModel.find({ rootId, status: { $in: ['pending', 'sent'] } }).select('kind index').lean<{ kind: string; index: number }[]>(),
  ]);
  const online = !!last?.createdAt && readingResponding(new Date(last.createdAt), pollSeconds, now.getTime());
  const season = parameter(settings, SEASON);
  const cwuMode = parameter(settings, CWU_MODE);
  const mode = await effectiveBoilerMode(rootId, settings);
  return {
    online,
    // wyłączony = stan 0 (wygaszanie bywa przy włączonym regulatorze, jak w Ustawieniach)
    regulatorOn: last?.state === undefined ? null : last.state !== 0,
    burning: last?.state !== undefined && FLAME_STATES.has(last.state),
    season: season === 0 ? 'winter' : season === 1 ? 'summer' : null,
    cwuOn: typeof cwuMode === 'number' ? cwuMode !== 0 : null,
    boilerTemp: typeof last?.heating_temp === 'number' ? last.heating_temp : null,
    cwuTemp: typeof last?.water_heater_temp === 'number' ? last.water_heater_temp : null,
    cwuTarget: typeof last?.water_heater_target === 'number' ? last.water_heater_target : (parameter(settings, CWU_TARGET) ?? null),
    heatPumpMode: mode === 'heat-pump',
    // zlecenie w toku: włącz / wyłącz regulator albo CWU — przyciski kafelka czekają na potwierdzenie
    pending: pending.some((c) => c.kind === 'control') ? 'control' : pending.some((c) => c.kind === 'ecomax' && c.index === CWU_MODE) ? 'cwu' : null,
  };
}

// Przycisk kafelka prostego. Rzuca CommandError (400/409) z komunikatem dla kafelka.
export async function simpleBoilerAction(rootId: string, action: SimpleAction, now = new Date()): Promise<SimpleBoilerState> {
  const state = await simpleBoilerState(rootId, now);
  const settings = await PelletBoilerSettingsModel.findOne({ rootId }).lean<PelletBoilerSettingsEntry>();
  const schedule = await getScheduleSettings(rootId);
  const { rootId: _root, ...scheduleInput } = schedule;
  const meta = (button: string) => appUserMeta('Kafelek prosty', `Przycisk „${button}” na kafelku prostym pieca.`);

  if (action === 'off') {
    if (schedule.enabled) await saveScheduleSettings(rootId, { ...scheduleInput, enabled: false });
    if (state.regulatorOn !== false) await createCommands(rootId, { changes: [{ kind: 'control', index: 0, value: 0 }] }, meta('Wyłącz piec'));
    return simpleBoilerState(rootId, now);
  }
  if (action === 'cwu-on' || action === 'cwu-off') {
    const value = action === 'cwu-on' ? 1 : 0;
    if (parameter(settings, CWU_MODE) !== value || (value === 1 && parameter(settings, CWU_MODE) === undefined)) {
      await createCommands(rootId, { changes: [{ kind: 'ecomax', index: CWU_MODE, value }] }, meta(value ? 'Włącz CWU' : 'Wyłącz CWU'));
    }
    return simpleBoilerState(rootId, now);
  }

  // on: w trybie pompy ciepła „włącz”, które rozpaliłoby kocioł, jest odrzucane jak w Ustawieniach
  const changes: PelletBoilerCommandChange[] = [];
  if (parameter(settings, CWU_MODE) === 0) changes.push({ kind: 'ecomax', index: CWU_MODE, value: 1 });
  if (!state.heatPumpMode && parameter(settings, SEASON) !== 0 && parameter(settings, SEASON) !== undefined) {
    changes.push({ kind: 'ecomax', index: SEASON, value: 0 });
  }
  if (state.regulatorOn !== true) {
    const control: PelletBoilerCommandChange = { kind: 'control', index: 0, value: 1 };
    const blocked = await turnOnCheck(rootId, [control], now);
    if (blocked) throw new CommandError(describeIgnition(blocked), 409);
    changes.push(control);
  }
  if (!schedule.enabled) await saveScheduleSettings(rootId, { ...scheduleInput, enabled: true });
  if (changes.length) await createCommands(rootId, { changes }, meta('Włącz piec'));
  // tryb pompy ciepła: Zima przez cykl Zimy (kocioł przejmuje grzanie domu po nagrzaniu przez pompę ciepła)
  if (state.heatPumpMode && state.season !== 'winter') await setManualSeason(rootId, 'winter', now);
  return simpleBoilerState(rootId, now);
}
