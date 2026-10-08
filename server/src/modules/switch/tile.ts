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

// Opis przekaźnika: kiedy się wyłączy, kiedy włączy według harmonogramu i jak jest w trybie ręcznym.
// Przy jednym przekaźniku (solo) pełnym zdaniem, bez nazwy, a tryb w drugiej linii (detail):
// „Włączony do 15:00” + „Harmonogram włączony”, „Włączy się jutro 06:00” + „Harmonogram włączony”,
// „Włączony do 15:00” + „Tryb ręczny”; przy kilku przekaźnikach krótko, obok nazwy, bez drugiej linii.
function relayText(relay: Relay, now: Date, solo: boolean): { text: string; detail?: string } {
  const until = warsawTime(new Date(relay.until ?? now));
  switch (relay.mode) {
    case 'off':
      return solo ? { text: 'Wyłączony ręcznie', detail: 'Harmonogram zablokowany' } : { text: 'wyłączony ręcznie' };
    case 'on':
      if (!relay.on) return { text: solo ? 'Włączanie…' : 'włączanie…' };
      return solo ? { text: 'Włączony bez limitu czasu', detail: 'Tryb ręczny' } : { text: 'wł. ręcznie bez limitu' };
    case 'timer':
      if (!relay.on) return { text: solo ? 'Włączanie…' : 'włączanie…' };
      return solo ? { text: `Włączony do ${until}`, detail: 'Tryb ręczny' } : { text: `wł. ręcznie do ${until}` };
    default:
      if (relay.on) return solo ? { text: `Włączony do ${until}`, detail: 'Harmonogram włączony' } : { text: `wł. do ${until} · harmonogram` };
      if (relay.nextStart) {
        const when = formatWhen(new Date(relay.nextStart), now);
        return solo ? { text: `Włączy się ${when}`, detail: 'Harmonogram włączony' } : { text: `wył. · następne ${when}` };
      }
      return solo ? { text: 'Wyłączony', detail: 'Brak wpisów w harmonogramie' } : { text: 'wył. · harmonogram' };
  }
}

// Włącznik z jednym przekaźnikiem w układzie kafelka pompy: duża wartość („Włączony”) z podpisem (do kiedy / kiedy się włączy)
// i wiersz z trybem („Harmonogram włączony”, „Tryb ręczny”, „Harmonogram zablokowany”).
function soloView(relay: Relay, now: Date): { value: string; label: string; mode: string } {
  const until = warsawTime(new Date(relay.until ?? now));
  switch (relay.mode) {
    case 'off':
      return { value: 'Wyłączony', label: 'ręcznie', mode: 'Harmonogram zablokowany' };
    case 'on':
      return relay.on
        ? { value: 'Włączony', label: 'bez limitu czasu', mode: 'Tryb ręczny' }
        : { value: 'Włączanie…', label: '', mode: 'Tryb ręczny' };
    case 'timer':
      return relay.on
        ? { value: 'Włączony', label: `do ${until}`, mode: 'Tryb ręczny' }
        : { value: 'Włączanie…', label: '', mode: 'Tryb ręczny' };
    default:
      if (relay.on) return { value: 'Włączony', label: `do ${until}`, mode: 'Harmonogram włączony' };
      if (relay.nextStart) {
        return { value: 'Wyłączony', label: `włączy się ${formatWhen(new Date(relay.nextStart), now)}`, mode: 'Harmonogram włączony' };
      }
      return { value: 'Wyłączony', label: 'brak wpisów', mode: 'Brak wpisów w harmonogramie' };
  }
}

export async function switchTile(rootId: string, _device: Device, now = new Date()): Promise<DeviceTile | null> {
  const relays = await listRelays(rootId, now);
  if (relays.length === 0) return { level: 'off', chip: 'Brak danych' };

  const lastSeen = relays.reduce<Date | null>(
    (latest, relay) => relay.lastSeenAt && (!latest || new Date(relay.lastSeenAt) > latest) ? new Date(relay.lastSeenAt) : latest, null);
  const online = relays.some((relay) => relay.online);
  const name = (relay: Relay) => relay.name || `Przekaźnik ${relay.relay}`;

  const solo = relays.length === 1;
  const tiles: TileRelay[] = relays.map((relay) => ({
    name: solo ? '' : name(relay),
    on: online && relay.on,
    ...(online ? relayText(relay, now, solo) : { text: solo ? 'Stan nieznany' : 'stan nieznany' }),
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

  if (solo) {
    const view = online ? soloView(relays[0], now) : { value: '---', label: 'stan nieznany', mode: '' };
    return {
      level,
      chip: offlineChip,
      main: { icon: 'power', value: view.value, label: view.label },
      row: view.mode ? [{ icon: 'sliders', value: view.mode }] : undefined,
      note,
      updatedAt: lastSeen?.toISOString(),
    };
  }

  return {
    level,
    chip: offlineChip,
    relays: tiles,
    note,
    updatedAt: lastSeen?.toISOString(),
  };
}
