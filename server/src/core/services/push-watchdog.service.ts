// Zdarzenia offline / online dla powiadomień Web Push (push.service.ts): co minutę liczy kafelki sterowników
// (tile.service.ts, ten sam chip Online / Offline, który widać na liście) i przy zmianie chipu względem
// poprzedniego przebiegu zgłasza notify('offline' | 'online'). Pierwszy przebieg po starcie tylko zapamiętuje stan
// (restart serwera nie rozsyła „sterownik znów odpowiada”). Liczy tylko wtedy, gdy ktoś ma regułę offline / online,
// żeby nie obciążać bazy bez potrzeby. Osobny plik od push.service.ts, bo tile.service → rejestr rodzajów → moduły
// → push.service (cykl importów przy wywołaniu z modułu).
import { UserModel } from '../models/user.model';
import { getDeviceTiles } from './tile.service';
import { notify, pushConfigured } from './push.service';

export const WATCHDOG_INTERVAL_MS = 60 * 1000;

const lastChip = new Map<string, string>();
let running = false;

/** jeden przebieg; eksport dla testów */
export async function runPushWatchdogOnce(now = new Date()) {
  if (running) return;
  running = true;
  try {
    if (!pushConfigured()) return;
    const wanted = await UserModel.exists({ 'notifications.rules.events': { $in: ['offline', 'online'] } });
    if (!wanted) return;
    const tiles = await getDeviceTiles();
    for (const [rootId, tile] of Object.entries(tiles)) {
      const chip = tile.chip === 'Offline' ? 'Offline' : tile.chip === 'Online' ? 'Online' : null;
      if (!chip) continue;
      const previous = lastChip.get(rootId);
      lastChip.set(rootId, chip);
      if (previous === undefined || previous === chip) continue;
      if (chip === 'Offline') {
        await notify(rootId, 'offline', { body: `Sterownik przestał odpowiadać.${tile.note?.text ? ` ${tile.note.text}` : ''}`, url: '/devices' }, now);
      } else {
        await notify(rootId, 'online', { body: 'Sterownik znów odpowiada.', url: '/devices' }, now);
      }
    }
  } catch (error) {
    console.error('[push] watchdog:', error);
  } finally {
    running = false;
  }
}

export function startPushWatchdog() {
  void runPushWatchdogOnce();
  setInterval(() => void runPushWatchdogOnce(), WATCHDOG_INTERVAL_MS);
}

/** testy */
export const resetPushWatchdog = () => lastChip.clear();
