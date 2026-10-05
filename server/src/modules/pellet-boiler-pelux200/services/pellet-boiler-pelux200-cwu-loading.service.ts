// Ładowanie CWU w kotle w trybie „Pompa ciepła”: kocioł jest wtedy rozdzielaczem ciepła z pompy ciepła,
// a CWU (najwyżej 45 °C) naładuje się tylko z cieplejszej wody, więc na czas ładowania pompa ciepła grzeje
// 47–49 °C (moduł pompy, services/cwu-loading.service.ts). Ładowanie = tryb pompy ciepła (nr 99 < 50 °C)
// i pracująca pompa CWU kotła w świeżym odczycie; koniec = pompa CWU staje (firmware 1.6.1 wysyła odczyt
// od razu po jej przełączeniu).
// Moduły nie importują siebie nawzajem: stan idzie do pompy przez API serwera (PUT /hp/cwu-loading,
// INTERNAL_API_URL albo http://127.0.0.1:PORT/api), co minutę (scheduler kotła) i po każdym odczycie
// kotła; pompa bez odświeżenia przez 15 min sama kończy ładowanie. Pompa ciepła to na razie jedyna
// pompa (heat_pump) na koncie — powiązanie kotła z wybraną pompą jest do zrobienia później.
// Stan dla ekranu głównego kotła (z informacją, że pompa ciepła jest wyłączona) jest w ustawieniach
// harmonogramu (pole cwuLoading), GET /pellet-boiler-pelux200/cwu-loading.
import { DeviceModel } from '../../../core/models/device.model';
import { DeviceType } from '../../../core/types';
import { sendMessage } from '../../../core/websocket';
import { PelletBoilerScheduleSettingsModel } from '../models/pellet-boiler-pelux200-schedule.model';
import { PelletBoilerSettingsEntry, PelletBoilerSettingsModel } from '../models/pellet-boiler-pelux200-settings.model';
import { PelletBoilerCwuLoading } from '../types';
import { getPelletBoilerPelux200Last } from './pellet-boiler-pelux200.service';
import { boilerMode } from './pellet-boiler-pelux200-settings.service';

// odczyt starszy niż to nie świadczy o ładowaniu (kocioł bez łączności)
const READING_MAX_AGE_MS = 15 * 60 * 1000;

// coPump: pompa CO kotła pracuje (świeży odczyt); pompa ciepła (co od 1.2.0) nie liczy wtedy COP
export type HeatPumpNotifier = (heatPumpRootId: string, active: boolean, since: Date | null, coPump?: boolean) => Promise<{ pumpOff: boolean }>;

const internalApiUrl = () => process.env.INTERNAL_API_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3001}/api`;

// PUT /hp/cwu-loading pompy ciepła (ten sam serwer, przez HTTP jak każdy klient API).
export const notifyHeatPump: HeatPumpNotifier = async (heatPumpRootId, active, since, coPump) => {
  const response = await fetch(`${internalApiUrl()}/hp/cwu-loading?rootId=${encodeURIComponent(heatPumpRootId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active, ...(since ? { since: since.toISOString() } : {}), ...(coPump !== undefined ? { co_pump: coPump } : {}) }),
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
  const [settings, last, saved] = await Promise.all([
    PelletBoilerSettingsModel.findOne({ rootId }).lean<PelletBoilerSettingsEntry>(),
    getPelletBoilerPelux200Last(rootId),
    getCwuLoadingState(rootId),
  ]);
  const readingAt = last ? new Date((last as { createdAt?: Date }).createdAt ?? 0) : null;
  const fresh = !!readingAt && now.getTime() - readingAt.getTime() < READING_MAX_AGE_MS;
  const active = boilerMode(settings) === 'heat-pump' && fresh && last?.water_heater_pump === true;
  const since = active ? (saved.active && saved.since ? new Date(saved.since) : readingAt ?? now) : null;

  const state: PelletBoilerCwuLoading = { active, since, heatPumpOff: false };
  const pump = await DeviceModel.findOne({ deviceType: DeviceType.HP }).select('_id').lean();
  if (!pump) {
    state.error = 'Brak pompy ciepła na koncie.';
  } else {
    try {
      state.heatPumpOff = (await notify(String(pump._id), active, since, fresh && last?.heating_pump === true)).pumpOff;
    } catch (error) {
      state.error = String((error as Error).message ?? error);
    }
  }
  await PelletBoilerScheduleSettingsModel.updateOne({ rootId }, { $set: { cwuLoading: state } }, { upsert: true });
  if (state.active !== saved.active || state.heatPumpOff !== saved.heatPumpOff) {
    console.log(`[pellet cwu] ${rootId} ładowanie CWU: ${active ? 'tak' : 'nie'}${state.error ? ` (${state.error})` : ''}`);
    sendMessage('update', rootId);
  }
  return state;
}
