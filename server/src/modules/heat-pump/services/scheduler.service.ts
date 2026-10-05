// Scheduler pompy ciepła: co minutę (startScheduler w server.ts) dla każdego urządzenia
// heat_pump wylicza operację z harmonogramów i ustawień domyślnych i zapisuje ją w
// operation.service. Niczego nie wysyła: sterownik co odbierze operację w odpowiedzi
// na najbliższe /hp/add. Wszystkie porównania czasu w Europe/Warsaw.
// Tryb pracy (properties.work_mode): ręczny — zawsze ustawienia domyślne, automatyczny —
// harmonogram, a poza wpisami ustawienia domyślne, OFF — pompa wyłączona. Tłumaczenie na
// kontrakt co (podłączenie CWU / CO): pump-mode.service.ts.
import { formatInTimeZone } from 'date-fns-tz';
import {
  HpEntry,
  OperationEntry,
  PumpWorkMode,
  ScheduleEntry,
  ScheduleType,
  WeekDay,
} from '../types';
import { DeviceType, PumpConnection } from '../../../core/types';
import { DeviceDocument, DeviceModel } from '../../../core/models/device.model';
import { getHpLastData } from './hp.service';
import { clearManualOperation, replaceOperationData } from './operation.service';
import { syncCwuLoading } from './cwu-loading.service';
import { heatingOperation, offOperation, pumpTemperatures, pumpWorkMode } from './pump-mode.service';
import { getLocalDayOfWeek, isPolishDayOff } from '../../../core/services/calendar.service';
import { TIME_ZONE } from '../../../core/time';

export const SCHEDULER_INTERVAL_MS = 60 * 1000;

// Stan z poprzedniego przebiegu, tylko w pamięci: po restarcie serwera nie widać
// zakończenia harmonogramu z pierwszego przebiegu.
const previousScheduleState = new Map<string, boolean>();

// Harmonogram działa tylko w trybie automatycznym: wszystkie wpisy (praca i przerwa OFF).
export function scheduleTypesForWorkMode(workMode: PumpWorkMode): ScheduleType[] {
  return workMode === 'AUTO' ? Object.values(ScheduleType) : [];
}

// Podłączenie z definicji pompy; bez definicji CWU (tak pompa pracowała do 2026-10-05).
const connectionOf = (device: DeviceDocument): PumpConnection => device.pumpConfig?.connection ?? 'cwu';

function toMinutes(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

// Data jednorazowa ma pierwszeństwo przed dayOfWeek. Dzień jest sprawdzany dla
// bieżącej chwili, także w zakresie przez północ: wpis „poniedziałek 22:00–06:00”
// działa w pon. 00:00–06:00 i 22:00–24:00, a nie we wtorek 00:00–06:00.
function isScheduleForToday(schedule: ScheduleEntry, now: Date): boolean {
  const localDate = formatInTimeZone(now, TIME_ZONE, 'yyyy-MM-dd');

  if (schedule.date) {
    return formatInTimeZone(new Date(schedule.date), TIME_ZONE, 'yyyy-MM-dd') === localDate;
  }

  const dayOfWeek = getLocalDayOfWeek(now) as WeekDay;
  const dayOff = isPolishDayOff(now);

  return schedule.dayOfWeek === WeekDay.ANY_DAY
    || schedule.dayOfWeek === dayOfWeek
    || (
      schedule.dayOfWeek === WeekDay.WORKDAYS
      && dayOfWeek >= WeekDay.MONDAY
      && dayOfWeek <= WeekDay.FRIDAY
      && !dayOff
    )
    || (schedule.dayOfWeek === WeekDay.DAYS_OFF && dayOff);
}

// Koniec zakresu wyłączny: o godzinie endTime wpis już nie działa.
function isScheduleActive(schedule: ScheduleEntry, now: Date): boolean {
  if (!schedule.enabled || !isScheduleForToday(schedule, now)) return false;

  const current = toMinutes(formatInTimeZone(now, TIME_ZONE, 'HH:mm'));
  const start = toMinutes(schedule.startTime);
  const end = toMinutes(schedule.endTime);

  if (start <= end) {
    return current >= start && current < end;
  }

  // Zakres przechodzący przez północ, np. 22:00-06:00.
  return current >= start || current < end;
}

// Data jednorazowa ma pierwszeństwo przed harmonogramem cyklicznym, a przerwa OFF przed pracą.
function scheduleScore(schedule: ScheduleEntry): number {
  return (schedule.date ? 10 : 0) + (schedule.type === ScheduleType.OFF ? 1 : 0);
}

// Jeden wpis z nakładających się: data > cykliczny, przerwa OFF > praca,
// potem późniejszy startTime, na końcu _id.
function getActiveSchedule(
  schedules: ScheduleEntry[],
  types: ScheduleType[],
  now: Date,
): ScheduleEntry | undefined {
  return schedules
    .filter((schedule) => types.includes(schedule.type) && isScheduleActive(schedule, now))
    .sort((first, second) => {
      const scoreDifference = scheduleScore(second) - scheduleScore(first);
      if (scoreDifference !== 0) return scoreDifference;

      const startDifference = second.startTime.localeCompare(first.startTime);
      if (startDifference !== 0) return startDifference;

      return String(second._id ?? '').localeCompare(String(first._id ?? ''));
    })[0];
}

// Operacja bez harmonogramu: tryb i temperatura od–do z properties (pump-mode.service.ts).
// Zawsze force "0" i nigdy co_pomp (stan pomp CO zostaje w sterowniku). Tryb nie z telemetrii:
// sterownik raportuje w niej tryb dostany od serwera, więc serwer odsyłałby mu jego własny stan.
function getDefaultOperation(device: DeviceDocument, lastData: HpEntry): OperationEntry {
  const properties = device.properties ?? {};
  const { min, max } = pumpTemperatures(properties, connectionOf(device), lastData);
  return pumpWorkMode(properties.work_mode) === 'OFF'
    ? offOperation(min, max)
    : heatingOperation(connectionOf(device), min, max);
}

// Wpis harmonogramu -> operacja: przerwa OFF wyłącza pompę (force "0"), praca (także dawne
// wpisy CO i CWU) grzeje z temperaturami wpisu; brakująca temperatura z ustawień domyślnych.
function scheduleToOperation(
  schedule: ScheduleEntry,
  device: DeviceDocument,
  lastData: HpEntry,
): OperationEntry {
  const defaults = pumpTemperatures(device.properties ?? {}, connectionOf(device), lastData);
  if (schedule.type === ScheduleType.OFF) return offOperation(defaults.min, defaults.max);
  return heatingOperation(
    connectionOf(device),
    schedule.minTemperature === undefined ? defaults.min : String(schedule.minTemperature),
    schedule.maxTemperature === undefined ? defaults.max : String(schedule.maxTemperature),
    schedule.forceStart ? '1' : '0',
  );
}

// Harmonogram, który działa teraz (dla zakładki Harmonogramy); null = obowiązuje ustawienie domyślne.
// work_mode: tryb pracy aplikacji (MANUAL, AUTO, OFF), także dla dawnych wartości w bazie.
export async function getCurrentSchedule(
  rootId: string,
  now = new Date(),
): Promise<{ scheduleId: string | null; work_mode: PumpWorkMode }> {
  const device = await DeviceModel.findById(rootId)
    .select('schedules properties')
    .lean<DeviceDocument>();

  if (!device) {
    throw new Error(`Configuration with ID not found: ${rootId}`);
  }

  const workMode = pumpWorkMode(device.properties?.work_mode);
  const activeSchedule = getActiveSchedule(
    device.schedules ?? [],
    scheduleTypesForWorkMode(workMode),
    now,
  );

  return {
    scheduleId: activeSchedule?._id ? String(activeSchedule._id) : null,
    work_mode: workMode,
  };
}

// Jeden przebieg dla wszystkich pomp (albo jednej: onlyRootId, np. zaraz po zapisie ustawień
// domyślnych); now jako parametr dla testów.
export async function runSchedulerOnce(now = new Date(), onlyRootId?: string): Promise<void> {
  const devices = await DeviceModel
    .find({ deviceType: DeviceType.HP, ...(onlyRootId ? { _id: onlyRootId } : {}) })
    .select('_id schedules properties pumpConfig deviceType deviceId')
    .lean<DeviceDocument[]>();

  for (const device of devices) {
    const rootId = String(device._id);

    const lastData = await getHpLastData(rootId);
    const activeSchedule = getActiveSchedule(
      device.schedules ?? [],
      scheduleTypesForWorkMode(pumpWorkMode(device.properties?.work_mode)),
      now,
    );

    // Koniec harmonogramu kasuje ręczne nadpisania: zmiana z Ustawień obowiązuje
    // najwyżej do końca bieżącego wpisu. Bez harmonogramu nadpisania trwają do
    // zapisu ustawień domyślnych (device-type.ts, onPropertiesSaved) albo restartu serwera.
    const hasActiveSchedule = Boolean(activeSchedule);
    if (previousScheduleState.get(rootId) === true && !hasActiveSchedule) {
      clearManualOperation(rootId);
    }
    previousScheduleState.set(rootId, hasActiveSchedule);

    const operation = activeSchedule
      ? scheduleToOperation(activeSchedule, device, lastData)
      : getDefaultOperation(device, lastData);

    // Sterownik pobiera OperationEntry przy zapisie telemetrii.
    // Scheduler celowo nie wysyła powiadomienia przez WebSocket.
    // Ładowanie CWU w kotle (nadpisanie 47–49 °C) zgodne z bazą: po restarcie serwera i po wygaśnięciu.
    await syncCwuLoading(rootId, now);
    replaceOperationData(rootId, operation);

    console.log(`[scheduler] ${rootId}`, operation);
  }
}

// Pierwszy przebieg od razu, potem co SCHEDULER_INTERVAL_MS; przebieg nie startuje,
// gdy poprzedni jeszcze trwa. Błąd przebiegu jest logowany, scheduler działa dalej.
export function startScheduler(): NodeJS.Timeout {
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;

    try {
      await runSchedulerOnce();
    } catch (error) {
      console.error('[scheduler] error:', error);
    } finally {
      running = false;
    }
  };

  void tick();
  return setInterval(() => void tick(), SCHEDULER_INTERVAL_MS);
}
