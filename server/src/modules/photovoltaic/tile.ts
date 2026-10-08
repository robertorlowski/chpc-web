// Kafelek fotowoltaiki na stronie /devices (GET /devices/summary): moc teraz, produkcja dziś i liczba
// pracujących paneli. Błąd (czerwony): alarm panelu (alarm_code ≠ 0) albo brak odczytów DTU dłużej niż 3 min
// w ciągu dnia (od 6:00 do 20:00 w Warszawie; w nocy brak odczytów nie jest błędem). Ostrzeżenie
// (pomarańczowy): panel offline albo poniżej 85 % średniej pozostałych (jak na wykresie produkcji).
import { Device, DeviceTile, TileFact } from '../../core/types';
import { formatAge, formatTemperature, formatUnit } from '../../core/services/tile-format';
import { TIME_ZONE } from '../../core/time';
import { getCurrentView } from './services/photovoltaic.service';

export const DAY_START_HOUR = 6;
export const DAY_END_HOUR = 20;
export const WEAK_PANEL_RATIO = 0.85;

const isDaytime = (now: Date) => {
  const hour = Number(now.toLocaleString('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', hour12: false }));
  return hour >= DAY_START_HOUR && hour < DAY_END_HOUR;
};

export async function photovoltaicTile(rootId: string, _device: Device, now = new Date()): Promise<DeviceTile | null> {
  const view = await getCurrentView(rootId, now);
  if (!view.readAt) return { level: 'off', chip: 'Brak danych' };

  const readAt = new Date(view.readAt);
  const age = now.getTime() - readAt.getTime();
  const panels = view.panels;
  const producing = panels.filter((panel) => panel.state === 'produces');
  const alarmed = panels.filter((panel) => panel.state === 'alarm');
  const offline = panels.filter((panel) => panel.state === 'offline');
  const powerSum = producing.reduce((sum, panel) => sum + (panel.power ?? 0), 0);
  // panel słabszy niż 85 % średniej pozostałych pracujących (przy co najmniej trzech pracujących)
  const weak = producing.length > 2
    ? producing.filter((panel) => (panel.power ?? 0) < WEAK_PANEL_RATIO * ((powerSum - (panel.power ?? 0)) / (producing.length - 1)))
    : [];

  let level: DeviceTile['level'] = 'ok';
  let note: DeviceTile['note'];
  let chip = (view.power ?? 0) > 0 ? 'Produkuje' : 'Nie produkuje';
  if (view.stale && isDaytime(now)) {
    level = 'err';
    chip = 'Brak danych';
    note = { level: 'err', text: `Brak odczytów z DTU od ${formatAge(age)} (sprawdź sterownik co)` };
  } else if (alarmed.length > 0) {
    level = 'err';
    note = { level: 'err', text: alarmed.length === 1 ? `Alarm panelu ${alarmed[0].key} (kod ${alarmed[0].alarm_code})` : `Alarm na ${alarmed.length} panelach` };
  } else if (offline.length > 0) {
    level = 'warn';
    note = { level: 'warn', text: offline.length === 1 ? `Panel ${offline[0].key} nie odpowiada` : `${offline.length} panele nie odpowiadają` };
  } else if (weak.length > 0) {
    level = 'warn';
    note = { level: 'warn', text: weak.length === 1 ? `Panel ${weak[0].key} daje poniżej 85 % średniej pozostałych` : `${weak.length} panele dają poniżej 85 % średniej` };
  }

  const side: TileFact[] = [
    { icon: 'battery', value: formatUnit(typeof view.todayWh === 'number' ? view.todayWh / 1000 : undefined, 'kWh', 1), label: 'dziś' },
  ];
  if (view.panelsAvailable) side.push({ icon: 'panel', value: `${producing.length} / ${panels.length}`, label: 'paneli' });

  return {
    level,
    chip,
    running: level !== 'err' && (view.power ?? 0) > 0,
    main: { icon: 'sun', value: formatUnit(view.power, 'W'), label: 'teraz' },
    side,
    row: typeof view.temperature === 'number' ? [{ icon: 'thermo', value: formatTemperature(view.temperature), label: 'falowniki' }] : undefined,
    note,
    updatedAt: readAt.toISOString(),
  };
}
