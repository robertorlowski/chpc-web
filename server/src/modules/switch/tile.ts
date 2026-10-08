// Kafelek włącznika na stronie /devices (GET /devices/summary): przekaźniki ze stanem i opisem trybu.
// Błąd (czerwony): sterownik offline (żaden przekaźnik bez zgłoszenia od 30 s). Ostrzeżenie (pomarańczowy):
// przekaźnik w trybie „Wyłączony”, który blokuje istniejący harmonogram, albo włączony bez limitu czasu
// dłużej niż doba.
import { Device, DeviceTile, TileRelay } from '../../core/types';
import { formatWhen, warsawTime } from '../../core/services/tile-format';
import { SwitchScheduleModel } from './models/switch-schedule.model';
import { listRelays } from './services/switch.service';

export const UNLIMITED_ON_WARNING_MS = 24 * 3600 * 1000;

type Relay = Awaited<ReturnType<typeof listRelays>>[number];

function relayText(relay: Relay, now: Date): string {
  if (relay.mode === 'off') return 'wyłączony ręcznie';
  if (relay.mode === 'on') return relay.on ? 'wł. bez limitu czasu' : 'włączanie…';
  if (relay.on) return `wł. do ${warsawTime(new Date(relay.until ?? now))}${relay.mode === 'schedule' ? ' · harmonogram' : ''}`;
  if (relay.mode === 'schedule' && relay.nextStart) return `wył. · następne ${formatWhen(new Date(relay.nextStart), now)}`;
  return relay.mode === 'schedule' ? 'wył. · harmonogram' : 'wył.';
}

export async function switchTile(rootId: string, _device: Device, now = new Date()): Promise<DeviceTile | null> {
  const relays = await listRelays(rootId, now);
  if (relays.length === 0) return { level: 'off', chip: 'Brak danych' };

  const lastSeen = relays.reduce<Date | null>(
    (latest, relay) => relay.lastSeenAt && (!latest || new Date(relay.lastSeenAt) > latest) ? new Date(relay.lastSeenAt) : latest, null);
  const online = relays.some((relay) => relay.online);
  const name = (relay: Relay) => relay.name || `Przekaźnik ${relay.relay}`;

  const tiles: TileRelay[] = relays.map((relay) => ({
    name: name(relay),
    on: online && relay.on,
    text: online ? relayText(relay, now) : 'stan nieznany',
  }));

  let level: DeviceTile['level'] = 'ok';
  let note: DeviceTile['note'];
  if (!online) {
    level = 'err';
    note = { level: 'err', text: lastSeen ? `Sterownik offline od ${formatWhen(lastSeen, now)}` : 'Sterownik jeszcze się nie zgłosił' };
  } else {
    const blocked = await Promise.all(relays.filter((relay) => relay.mode === 'off').map(async (relay) =>
      (await SwitchScheduleModel.countDocuments({ rootId, relay: relay.relay, enabled: true })) > 0 ? relay : null));
    const blockedRelay = blocked.find((relay) => relay !== null);
    const unlimited = relays.find((relay) => relay.mode === 'on' && relay.modeChangedAt
      && now.getTime() - new Date(relay.modeChangedAt).getTime() > UNLIMITED_ON_WARNING_MS);
    if (blockedRelay) {
      level = 'warn';
      note = { level: 'warn', text: `${name(blockedRelay)}: tryb „Wyłączony” blokuje harmonogram` };
    } else if (unlimited) {
      level = 'warn';
      note = { level: 'warn', text: `${name(unlimited)}: włączony bez limitu czasu od ponad doby` };
    }
  }

  return {
    level,
    chip: online ? 'Online' : 'Offline',
    relays: tiles,
    note,
    updatedAt: lastSeen?.toISOString(),
  };
}
