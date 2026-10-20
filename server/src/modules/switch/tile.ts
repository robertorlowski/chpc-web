// Kafelek włącznika na stronie /devices (GET /devices/summary): przekaźniki ze stanem i opisem trybu.
// Offline (żaden przekaźnik bez zgłoszenia od 5 min): do godziny uwaga (pomarańczowa), potem błąd (czerwony). Ostrzeżenie (pomarańczowy):
// przekaźnik w trybie „Wyłączony”, który blokuje istniejący harmonogram, albo włączony bez limitu czasu
// dłużej niż doba.
// Kafelek prosty (2026-10-20, client/src/devices/switch/components/SimpleTile.tsx) korzysta z tych samych danych
// i dodatkowo z numeru, trybu, końca włączenia / przerwy, najbliższego włączenia z harmonogramu i domyślnego
// czasu „Włącz” (onMinutes), żeby ułożyć zdania „Bojler uruchomi się teraz na 30 min” itp.
import { Device, DeviceTile, TileRelay } from '../../core/types';
import { formatWhen, offlineLevel, warsawTime } from '../../core/services/tile-format';
import { SwitchScheduleModel } from './models/switch-schedule.model';
import { listRelays } from './services/switch.service';
import { nextScheduleStart } from './services/switch-schedule.service';

export const UNLIMITED_ON_WARNING_MS = 24 * 3600 * 1000;
// domyślny czas „Włącz” nowego włącznika (device-type.ts DEFAULT_SWITCH_PROPERTIES; tu bez importu, bo byłby cykl)
const DEFAULT_ON_MINUTES = 30;

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
    case 'pause':
      return `wył. do ${until} · potem harmonogram`;
    default:
      if (relay.on) return `wł. do ${until} · harmonogram`;
      if (relay.nextStart) return `wył. · następne ${formatWhen(new Date(relay.nextStart), now)}`;
      return 'wył. · harmonogram';
  }
}

export async function switchTile(rootId: string, device: Device, now = new Date()): Promise<DeviceTile | null> {
  const relays = await listRelays(rootId, now);
  if (relays.length === 0) return { level: 'off', chip: 'Brak danych' };
  const schedules = await SwitchScheduleModel.find({ rootId, enabled: true }).lean();

  const lastSeen = relays.reduce<Date | null>(
    (latest, relay) => relay.lastSeenAt && (!latest || new Date(relay.lastSeenAt) > latest) ? new Date(relay.lastSeenAt) : latest, null);
  const online = relays.some((relay) => relay.online);
  const name = (relay: Relay) => relay.name || `Przekaźnik ${relay.relay}`;
  // najbliższe włączenie z harmonogramu: przy włączonym przekaźniku po końcu bieżącego włączenia (kafelek prosty:
  // „wyłączy się teraz i będzie automatycznie uruchomiony o …”), przy wyłączonym jak w listRelays
  const nextStart = (relay: Relay): string | null => {
    if (!relay.desiredOn) return relay.nextStart ? new Date(relay.nextStart).toISOString() : null;
    const from = relay.until && new Date(relay.until) > now ? new Date(relay.until) : now;
    return nextScheduleStart(schedules.filter((schedule) => schedule.relay === relay.relay), from)?.toISOString() ?? null;
  };

  const tiles: TileRelay[] = relays.map((relay) => ({
    name: name(relay),
    on: online && relay.on,
    text: online ? relayText(relay, now) : 'stan nieznany',
    relay: relay.relay,
    mode: relay.mode,
    desiredOn: relay.desiredOn,
    until: relay.until ? new Date(relay.until).toISOString() : null,
    nextStart: nextStart(relay),
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
    const blockedRelay = relays.find((relay) => relay.mode === 'off' && schedules.some((schedule) => schedule.relay === relay.relay));
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

  const minutes = (device.properties as { default_on_minutes?: unknown } | undefined)?.default_on_minutes;
  return {
    level,
    chip: offlineChip,
    relays: tiles,
    note,
    updatedAt: lastSeen?.toISOString(),
    onMinutes: typeof minutes === 'number' ? minutes : DEFAULT_ON_MINUTES,
  };
}
