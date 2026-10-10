// Ładowanie CWU w kotle w trybie „Pompa ciepła”: kocioł jest wtedy rozdzielaczem ciepła z pompy ciepła,
// a CWU (najwyżej 45 °C) naładuje się tylko z cieplejszej wody, więc na czas ładowania pompa ciepła grzeje
// 47–49 °C (moduł pompy, services/cwu-loading.service.ts). Ładowanie = tryb pompy ciepła (nr 99 < 50 °C)
// i pracująca pompa CWU kotła w świeżym odczycie; koniec = pompa CWU staje (firmware 1.6.1 wysyła odczyt
// od razu po jej przełączeniu).
// Moduły nie importują siebie nawzajem: stan idzie do pompy przez API serwera (PUT /hp/cwu-loading,
// INTERNAL_API_URL albo http://127.0.0.1:PORT/api), co minutę (scheduler kotła) i po każdym odczycie
// kotła; pompa bez odświeżenia przez 15 min sama kończy ładowanie. Pompa ciepła to pompa powiązana
// z kotłem w jego definicji (heat-pump-link.service.ts); bez niej ładowania nie ma.
// Stan dla ekranu głównego kotła (z informacją, że pompa ciepła jest wyłączona) jest w ustawieniach
// harmonogramu (pole cwuLoading), GET /pellet-boiler-pelux200/cwu-loading.
// Tą samą drogą idzie wstrzymanie pompy ciepła (pellet_block → tryb OFF): zasada bezpieczeństwa z 2026-10-10 —
// pompa stoi, gdy kocioł się rozpala lub pali (stany 1–4) albo ma co najmniej HOT_BOILER_FROM (50 °C), w każdym
// trybie; rusza poniżej HOT_BOILER_FROM − HOT_BOILER_HYSTERESIS. Gorąca woda z kotła w skraplaczu zatrzymałaby
// sprężarkę błędem Tho (po 5 błędach blokada CHPC). Do tego CWU z peletu (pellet-cwu.service.ts) od podniesienia
// zadanej kotła do jego ostygnięcia.
import { sendMessage } from '../../../core/websocket';
import { PelletBoilerScheduleSettingsModel } from '../models/pellet-boiler-pelux200-schedule.model';
import { PelletBoilerSettingsEntry, PelletBoilerSettingsModel } from '../models/pellet-boiler-pelux200-settings.model';
import { PelletBoilerCwuLoading } from '../types';
import { getPelletBoilerPelux200Last } from './pellet-boiler-pelux200.service';
import { effectiveBoilerMode, linkedHeatPumpRootId } from './pellet-boiler-pelux200-heat-pump-link.service';
import { getPelletCwu, pelletCwuBlocksPump } from './pellet-boiler-pelux200-pellet-cwu.service';

// odczyt starszy niż to nie świadczy o ładowaniu (kocioł bez łączności)
const READING_MAX_AGE_MS = 15 * 60 * 1000;
export const HOT_BOILER_FROM = 50;
export const HOT_BOILER_HYSTERESIS = 2;
// stabilizacja, rozpalanie, praca, nadzór
const BURNING_STATES = [1, 2, 3, 4];

// coPump: pompa CO kotła pracuje (świeży odczyt); pompa ciepła (co od 1.2.0) nie liczy wtedy COP
// pelletBlock: pompa ciepła wstrzymana — kocioł pali albo jest gorący, albo CWU z peletu (pellet-cwu.service.ts)
export type HeatPumpNotifier = (heatPumpRootId: string, active: boolean, since: Date | null, coPump?: boolean, pelletBlock?: boolean) => Promise<{ pumpOff: boolean }>;

const internalApiUrl = () => process.env.INTERNAL_API_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3001}/api`;

// PUT /hp/cwu-loading pompy ciepła (ten sam serwer, przez HTTP jak każdy klient API).
export const notifyHeatPump: HeatPumpNotifier = async (heatPumpRootId, active, since, coPump, pelletBlock) => {
  const response = await fetch(`${internalApiUrl()}/hp/cwu-loading?rootId=${encodeURIComponent(heatPumpRootId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active, ...(since ? { since: since.toISOString() } : {}), ...(coPump !== undefined ? { co_pump: coPump } : {}), ...(pelletBlock !== undefined ? { pellet_block: pelletBlock } : {}) }),
  });
  if (!response.ok) throw new Error(`pompa ciepła: HTTP ${response.status}`);
  const body = await response.json() as { pumpOff?: boolean };
  return { pumpOff: body.pumpOff === true };
};

export async function getCwuLoadingState(rootId: string): Promise<PelletBoilerCwuLoading> {
  const saved = (await PelletBoilerScheduleSettingsModel.findOne({ rootId }).lean<{ cwuLoading?: PelletBoilerCwuLoading }>())?.cwuLoading;
  return saved ?? { active: false, since: null, heatPumpOff: false };
}

// Wylicza ładowanie z ostatniego odczytu i zgłasza je pompie ciepła; zapisuje stan dla ekranu kotła.
export async function evaluateCwuLoading(rootId: string, now = new Date(), notify: HeatPumpNotifier = notifyHeatPump) {
  const [settings, last, saved, pelletCwu] = await Promise.all([
    PelletBoilerSettingsModel.findOne({ rootId }).lean<PelletBoilerSettingsEntry>(),
    getPelletBoilerPelux200Last(rootId),
    getCwuLoadingState(rootId),
    getPelletCwu(rootId),
  ]);
  const readingAt = last ? new Date((last as { createdAt?: Date }).createdAt ?? 0) : null;
  const fresh = !!readingAt && now.getTime() - readingAt.getTime() < READING_MAX_AGE_MS;
  // CWU z peletu: CWU grzeje kocioł, pompa ciepła nie ładuje (i bywa wstrzymana)
  const active = !pelletCwu.enabled && (await effectiveBoilerMode(rootId, settings)) === 'heat-pump' && fresh && last?.water_heater_pump === true;
  // kocioł pali albo jest gorący; zwolnienie z histerezą (wstrzymana pompa czeka do 48 °C)
  const hotFrom = HOT_BOILER_FROM - (saved.pumpBlocked ? HOT_BOILER_HYSTERESIS : 0);
  const hot = fresh && (BURNING_STATES.includes(last?.state ?? -1)
    || (typeof last?.heating_temp === 'number' && last.heating_temp >= hotFrom));
  const pelletBlock = pelletCwuBlocksPump(pelletCwu) || hot;
  const since = active ? (saved.active && saved.since ? new Date(saved.since) : readingAt ?? now) : null;

  const state: PelletBoilerCwuLoading = { active, since, heatPumpOff: false, pumpBlocked: pelletBlock };
  const pumpRootId = await linkedHeatPumpRootId(rootId);
  const pump = pumpRootId ? { _id: pumpRootId } : null;
  if (!pump) {
    state.error = 'Brak pompy ciepła na koncie.';
  } else {
    try {
      state.heatPumpOff = (await notify(String(pump._id), active, since, fresh && last?.heating_pump === true, pelletBlock)).pumpOff;
    } catch (error) {
      state.error = String((error as Error).message ?? error);
    }
  }
  await PelletBoilerScheduleSettingsModel.updateOne({ rootId }, { $set: { cwuLoading: state } }, { upsert: true });
  if (state.active !== saved.active || state.heatPumpOff !== saved.heatPumpOff || !!state.pumpBlocked !== !!saved.pumpBlocked) {
    console.log(`[pellet cwu] ${rootId} ładowanie CWU: ${active ? 'tak' : 'nie'}, pompa ciepła wstrzymana: ${pelletBlock ? 'tak' : 'nie'}${state.error ? ` (${state.error})` : ''}`);
    sendMessage('update', rootId);
  }
  return state;
}
