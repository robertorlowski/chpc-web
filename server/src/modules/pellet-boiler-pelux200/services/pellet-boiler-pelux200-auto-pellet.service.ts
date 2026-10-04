// Automatyczne przejście na tryb Pellet (decyzja użytkownika 2026-10-04): gdy kocioł w trybie „Pompa ciepła”
// (nr 99 < 50 °C) zgłosi rozpalanie (stan 2), serwer od razu zleca nastawy trybu Pellet (profiles.pellet
// z ustawień harmonogramu) — bez wyłączania regulatora, w trakcie palenia; to jedyny wyjątek od zasady
// „zmiana trybu tylko na postoju albo przy wyłączonym kotle” (Ustawienia → Tryb pracy). Kolejność jak
// w aplikacji (orderChanges): granice poszerzające zakres, zadane, granice zawężające, reszta — przejście
// idzie w górę (zadana 30 → 67 przed minimum 30 → 65), więc nic nie wymusza wygaszenia ani przegrzania.
// Ekran główny kotła pokazuje czerwony komunikat do kliknięcia „OK” (POST …/auto-pellet/ack); powrót na
// pompę ciepła tylko ręcznie. Do potwierdzenia komunikatu przejście nie jest powtarzane.
// Wołane po każdym odczycie kotła (kontroler /add; firmware 1.6.x wysyła odczyt od razu po zmianie stanu).
import { sendMessage } from '../../../core/websocket';
import { PelletBoilerCommandModel } from '../models/pellet-boiler-pelux200-command.model';
import { PelletBoilerScheduleSettingsModel } from '../models/pellet-boiler-pelux200-schedule.model';
import { PelletBoilerSettingsEntry, PelletBoilerSettingsModel } from '../models/pellet-boiler-pelux200-settings.model';
import { PelletBoilerAutoPellet, PelletBoilerCommandChange } from '../types';
import { createCommands } from './pellet-boiler-pelux200-command.service';
import { getPelletBoilerPelux200Last } from './pellet-boiler-pelux200.service';
import { getScheduleSettings } from './pellet-boiler-pelux200-schedule.service';
import { boilerMode, buildSettingsView } from './pellet-boiler-pelux200-settings.service';

const KINDLING = 2;
// odczyt starszy niż to nie wyzwala przejścia (np. zaległy odczyt po powrocie łączności)
const READING_MAX_AGE_MS = 5 * 60 * 1000;

// Bieżąca wartość surowa parametru z odczytu ustawień (kocioł albo mieszacz).
const currentRaw = (view: ReturnType<typeof buildSettingsView>, change: PelletBoilerCommandChange) =>
  (change.kind === 'mixer'
    ? view.mixers.find((m) => m.mixer === change.mixer)?.parameters.find((p) => p.index === change.index)
    : view.groups.flatMap((g) => g.parameters).find((p) => p.index === change.index))?.raw[0];

// Kolejność jak orderChanges w kliencie (components/MainParameters.tsx): 0 granica poszerzająca zakres
// zadanej, 1 zadana, 2 granica zawężająca, 3 reszta; w obrębie rangi kolejność profilu.
export function orderProfileChanges(changes: PelletBoilerCommandChange[], current: (c: PelletBoilerCommandChange) => number | undefined) {
  const rank = (change: PelletBoilerCommandChange) => {
    const raising = change.value > (current(change) ?? change.value);
    const role = change.kind === 'ecomax'
      ? ({ 99: 'min', 100: 'max', 98: 'target' } as Record<number, string>)[change.index]
      : ({ 1: 'min', 2: 'max', 0: 'target' } as Record<number, string>)[change.index];
    if (role === 'min') return raising ? 2 : 0;
    if (role === 'max') return raising ? 0 : 2;
    return role === 'target' ? 1 : 3;
  };
  return changes.map((change, i) => ({ change, i, r: rank(change) }))
    .sort((a, b) => a.r - b.r || a.i - b.i).map(({ change }) => change);
}

// Klucz profilu „ecomax:<nr>” / „mixer<n>:<nr>” → zmiana.
const changeOf = (key: string, value: number): PelletBoilerCommandChange => {
  const [kind, index] = key.split(':');
  return kind === 'ecomax'
    ? { kind: 'ecomax', index: Number(index), value }
    : { kind: 'mixer', mixer: Number(kind.slice(5)), index: Number(index), value };
};

export async function getAutoPellet(rootId: string): Promise<PelletBoilerAutoPellet | null> {
  const saved = await PelletBoilerScheduleSettingsModel.findOne({ rootId }).lean<{ autoPellet?: PelletBoilerAutoPellet }>();
  return saved?.autoPellet && !saved.autoPellet.acknowledged ? saved.autoPellet : null;
}

export async function acknowledgeAutoPellet(rootId: string) {
  await PelletBoilerScheduleSettingsModel.updateOne({ rootId }, { $set: { 'autoPellet.acknowledged': true } });
  sendMessage('update', rootId);
}

// Po odczycie kotła: rozpalanie w trybie pompy ciepła → nastawy trybu Pellet. Zwraca zlecone zmiany albo null.
export async function checkAutoPellet(rootId: string, now = new Date()) {
  const [last, settings] = await Promise.all([
    getPelletBoilerPelux200Last(rootId),
    PelletBoilerSettingsModel.findOne({ rootId }).lean<PelletBoilerSettingsEntry>(),
  ]);
  const readingAt = last ? new Date((last as { createdAt?: Date }).createdAt ?? 0) : null;
  if (last?.state !== KINDLING || !readingAt || now.getTime() - readingAt.getTime() > READING_MAX_AGE_MS) return null;
  if (!settings || boilerMode(settings) !== 'heat-pump') return null;
  if (await getAutoPellet(rootId)) return null;
  const { profiles } = await getScheduleSettings(rootId);
  // przejście już w drodze: zadana albo minimum kotła z wartością trybu Pellet czeka na kocioł
  // (starsze oczekujące zlecenia z innymi wartościami zostaną zastąpione)
  const inFlight = [98, 99].map((index) => ({ index, value: profiles.pellet[`ecomax:${index}`] })).filter((c) => c.value !== undefined);
  if (inFlight.length && await PelletBoilerCommandModel.exists({
    rootId, kind: 'ecomax', status: { $in: ['pending', 'sent'] }, $or: inFlight,
  })) return null;

  const view = buildSettingsView(settings);
  const current = (change: PelletBoilerCommandChange) => currentRaw(view, change);
  const changes = orderProfileChanges(
    Object.entries(profiles.pellet).map(([key, value]) => changeOf(key, value)).filter((c) => current(c) !== c.value),
    current,
  );
  const autoPellet: PelletBoilerAutoPellet = { at: readingAt, acknowledged: false, changes: changes.length };
  try {
    if (changes.length) await createCommands(rootId, { changes });
  } catch (error) {
    autoPellet.error = String((error as Error).message ?? error);
  }
  await PelletBoilerScheduleSettingsModel.updateOne({ rootId }, { $set: { autoPellet } }, { upsert: true });
  console.log(`[pellet] ${rootId} rozpalanie w trybie pompy ciepła — przejście na Pellet, zmian: ${changes.length}${autoPellet.error ? ` (${autoPellet.error})` : ''}`);
  sendMessage('update', rootId);
  return changes;
}
