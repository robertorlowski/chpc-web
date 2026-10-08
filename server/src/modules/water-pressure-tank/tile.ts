// Kafelek hydroforu na stronie /devices (GET /devices/summary): czy pompa pracuje, woda, czas pompy i
// liczba uruchomień z dzisiejszego dnia oraz woda z całego bieżącego miesiąca (dziś / miesiąc). Błąd (czerwony): pompa pracuje bez przerwy dłużej niż 30 min
// (wyciek albo praca na sucho). Ostrzeżenie (pomarańczowy): brak przepływu (za mało odczytów wodomierza)
// albo dzisiejsze uruchomienie z czasem przybliżonym (z kolejki po braku sieci). Brak łączności NIE jest
// błędem: sterownik ma zasilanie tylko w czasie pracy pompy, więc zwykle milczy.
import { Device, DeviceTile } from '../../core/types';
import { formatDuration, formatUnit, formatWhen } from '../../core/services/tile-format';
import { warsawDayBoundsUTC } from '../../core/time';
import { WaterPressureTankRunModel } from './models/water-pressure-tank-run.model';
import {
  RUN_IN_PROGRESS_MS, getFlowRate, getWaterPressureTankRuns, litersFor, pumpSeconds,
} from './services/water-pressure-tank.service';
import { WaterPressureTankRun } from './types';

export const LONG_RUN_MS = 30 * 60 * 1000;

export async function waterPressureTankTile(rootId: string, _device: Device, now = new Date()): Promise<DeviceTile | null> {
  const todayDate = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Warsaw' });
  const today = warsawDayBoundsUTC(todayDate);
  const monthStart = warsawDayBoundsUTC(`${todayDate.slice(0, 8)}01`).startUTC;
  const [last, monthRuns, { flow, litersPerSecond }] = await Promise.all([
    WaterPressureTankRunModel.findOne({ rootId }).sort({ pumpStart: -1 }).lean<WaterPressureTankRun>(),
    getWaterPressureTankRuns(rootId, monthStart, today.endUTC),
    getFlowRate(rootId),
  ]);
  const runs = monthRuns.filter((run) => new Date(run.pumpStart) >= today.startUTC);
  if (!last) return { level: 'off', chip: 'Brak uruchomień' };

  const running = now.getTime() - new Date(last.lastSeenAt ?? last.pumpEnd).getTime() < RUN_IN_PROGRESS_MS;
  const runningMs = now.getTime() - new Date(last.pumpStart).getTime();
  const seconds = runs.reduce((total, run) => total + pumpSeconds(run), 0);
  const liters = litersFor(seconds, litersPerSecond);
  const monthLiters = litersFor(monthRuns.reduce((total, run) => total + pumpSeconds(run), 0), litersPerSecond);

  let level: DeviceTile['level'] = 'ok';
  let note: DeviceTile['note'];
  if (running && runningMs > LONG_RUN_MS) {
    level = 'err';
    note = { level: 'err', text: 'Pompa pracuje bez przerwy ponad 30 min (wyciek albo praca na sucho?)' };
  } else if (flow.litersPerMinute === null) {
    level = 'warn';
    note = { level: 'warn', text: 'Brak przepływu: wpisz kolejny odczyt wodomierza, żeby liczyć litry' };
  } else if (runs.some((run) => run.timeApproximate)) {
    level = 'warn';
    note = { level: 'warn', text: 'Uruchomienie z czasem przybliżonym (wysłane z kolejki po braku sieci)' };
  }

  return {
    level,
    chip: running ? `Pompa pracuje ${formatDuration(runningMs / 1000)}` : 'Nie pracuje',
    running: running && level !== 'err',
    main: { icon: 'drop', value: liters === null ? '---' : formatUnit(liters, 'l'), label: 'dziś' },
    main2: { icon: 'drop', value: monthLiters === null ? '---' : formatUnit(monthLiters, 'l'), label: 'miesiąc' },
    // dwie liczby obok siebie (dziś / miesiąc) zajmują prawie całą szerokość kafelka, więc czas pompy i
    // uruchomienia idą do osobnego wiersza pod nimi (pierwsza wartość po lewej, ostatnia po prawej)
    row: [
      { icon: 'timer', value: formatDuration(seconds), label: 'pompa' },
      { icon: 'repeat', value: String(runs.length), label: 'uruchomień' },
      ...(running && last.compressorRunning ? [{ icon: 'bubbles' as const, value: 'wł.', label: 'kompresor' }] : []),
    ],
    note,
    foot: `ostatnie uruchomienie ${formatWhen(new Date(last.pumpStart), now)}`,
    // ostatnie zgłoszenie sterownika: klient pisze pod „ostatnie uruchomienie” także „dane sprzed …”
    updatedAt: new Date(last.lastSeenAt ?? last.pumpEnd).toISOString(),
  };
}
