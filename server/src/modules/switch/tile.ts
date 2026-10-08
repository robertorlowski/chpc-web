// Kafelek włącznika na stronie /devices (GET /devices/summary): przekaźniki ze stanem i opisem trybu.
// Offline (żaden przekaźnik bez zgłoszenia od 5 min): do godziny uwaga (pomarańczowa), potem błąd (czerwony). Ostrzeżenie (pomarańczowy):
// przekaźnik w trybie „Wyłączony”, który blokuje istniejący harmonogram, albo włączony bez limitu czasu
// dłużej niż doba.
import { Device, DeviceTile, TileRelay } from '../../core/types';
import { formatWhen, offlineLevel, warsawTime } from '../../core/services/tile-format';
import { SwitchScheduleModel } from './models/switch-schedule.model';
import { listRelays } from './services/switch.service';

export const UNLIMITED_ON_WARNING_MS = 24 * 3600 * 1000;

type Relay = Awaited<ReturnType<typeof listRelays>>[number];

// Opis przekaźnika obok nazwy: kiedy się wyłączy, kiedy włączy według harmonogramu i jak jest w trybie ręcznym.
function relayText(relay: Relay, now: Date): string {
  const until = warsawTime(new Date(relay.until ?? now));
  switch (relay.mode) {
    case 'off':
      return 'wyłączony ręcznie';
    case 'on':
      return relay.on ? 'wł. ręcznie bez limitu' : 'włączanie…';
    case 'timer':
      return relay.on ? `wł. ręcznie do ${until}` : 'włączanie…';
    default:
      if (relay.on) return `wł. do ${until} · harmonogram`;
      if (relay.nextStart) return `wył. · następne ${formatWhen(new Date(relay.nextStart), now)}`;
      return 'wył. · harmonogram';
  }
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
  let offlineChip = 'Online';
  if (!online) {
    // do godziny uwaga (płytka zwykle wraca sama), potem błąd; brak jakiegokolwiek zgłoszenia to od razu błąd
    level = lastSeen ? offlineLevel(now.getTime() - lastSeen.getTime()) : 'err';
    offlineChip = 'Offline';
    if (!lastSeen) note = { level, text: 'Sterownik jeszcze się nie zgłosił' };
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
    chip: offlineChip,
    relays: tiles,
    note,
    updatedAt: lastSeen?.toISOString(),
  };
}
