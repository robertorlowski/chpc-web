// Scheduler pompy ciepła: co minutę (startScheduler w server.ts) dla każdego urządzenia
// heat_pump wylicza operację z harmonogramów i ustawień domyślnych i zapisuje ją w
// operation.service. Niczego nie wysyła: sterownik co odbierze operację w odpowiedzi
// na najbliższe /hp/add. Wszystkie porównania czasu w Europe/Warsaw.
// Tryb pracy (properties.work_mode): ręczny — zawsze ustawienia domyślne, automatyczny —
// harmonogram, a poza wpisami ustawienia domyślne, OFF — pompa wyłączona. Tłumaczenie na
// kontrakt co (podłączenie CWU / CO): pump-mode.service.ts.
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import {
  HpEntry,
  OperationEntry,
  PumpWorkMode,
  ScheduleEntry,
  ScheduleType,
  WeekDay,
} from '../types';
import { DeviceType, OperationMeta, PlannedOperation, PumpConnection } from '../../../core/types';
import { systemMeta } from '../../../core/services/operation-log.service';
import { noteOperationChange, plannedOperation } from './hp-operation-log.service';
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
// wpis harmonogramu z poprzedniego przebiegu (dziennik operacji: początek / koniec wpisu)
const previousSchedule = new Map<string, ScheduleEntry | null>();

const WORK_MODE_NAMES: Record<PumpWorkMode, string> = { MANUAL: 'Ręczny', AUTO: 'Automatyczny', OFF: 'Wyłączony' };
const scheduleName = (schedule: ScheduleEntry) =>
  `${schedule.type === ScheduleType.OFF ? 'przerwy OFF' : 'pracy'} ${schedule.startTime}–${schedule.endTime}`;

// Dziennik operacji: dlaczego scheduler zmienił operację (początek albo koniec wpisu, poza harmonogramem).
function schedulerMeta(previous: ScheduleEntry | null | undefined, active: ScheduleEntry | undefined, workMode: PumpWorkMode): OperationMeta {
  const conditions = `tryb pracy ${WORK_MODE_NAMES[workMode]}`;
  const changed = String(previous?._id ?? '') !== String(active?._id ?? '');
  if (changed && active) return systemMeta('Harmonogram', `Początek wpisu ${scheduleName(active)}.`, conditions);
  if (changed && previous) {
    return systemMeta('Harmonogram', `Koniec wpisu ${scheduleName(previous)} — poza harmonogramem ustawienia domyślne.`, conditions);
  }
  return systemMeta('Harmonogram', active ? `Wpis ${scheduleName(active)}.` : 'Poza harmonogramem: ustawienia domyślne.', conditions);
}

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
// meta: kto spowodował przeliczenie (np. zapis ustawień domyślnych); bez niego opis z harmonogramu.
export async function runSchedulerOnce(now = new Date(), onlyRootId?: string, meta?: OperationMeta): Promise<void> {
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
    const previous = previousSchedule.get(rootId);
    previousSchedule.set(rootId, activeSchedule ?? null);

    const operation = activeSchedule
      ? scheduleToOperation(activeSchedule, device, lastData)
      : getDefaultOperation(device, lastData);

    // Sterownik pobiera OperationEntry przy zapisie telemetrii.
    // Scheduler celowo nie wysyła powiadomienia przez WebSocket.
    // Ładowanie CWU w kotle (nadpisanie 47–49 °C) zgodne z bazą: po restarcie serwera i po wygaśnięciu.
    await syncCwuLoading(rootId, now);
    replaceOperationData(rootId, operation);
    await noteOperationChange(rootId, meta ?? schedulerMeta(previous, activeSchedule, pumpWorkMode(device.properties?.work_mode)));

    console.log(`[scheduler] ${rootId}`, operation);
  }
}

// Dziennik operacji, „Zaplanowane”: zmiany operacji na granicach wpisów harmonogramu od now do dayEnd (tylko tryb
// automatyczny). Operacja przed i po granicy liczona tak jak w przebiegu schedulera; ręczne nadpisania pominięte.
export async function plannedSchedulerOperations(rootId: string, now: Date, dayEnd: Date): Promise<PlannedOperation[]> {
  const device = await DeviceModel.findById(rootId).select('schedules properties pumpConfig').lean<DeviceDocument>();
  if (!device) return [];
  const workMode = pumpWorkMode(device.properties?.work_mode);
  const types = scheduleTypesForWorkMode(workMode);
  if (!types.length) return [];
  const lastData = await getHpLastData(rootId);
  const schedules = (device.schedules ?? []).filter((schedule) => schedule.enabled && types.includes(schedule.type));
  const operationAt = (time: Date) => {
    const active = getActiveSchedule(schedules, types, time);
    return { active, operation: active ? scheduleToOperation(active, device, lastData) : getDefaultOperation(device, lastData) };
  };
  const today = formatInTimeZone(now, TIME_ZONE, 'yyyy-MM-dd');
  const times = new Set<number>();
  for (const schedule of schedules) {
    for (const time of [schedule.startTime, schedule.endTime]) {
      const at = fromZonedTime(`${today}T${time}:00`, TIME_ZONE);
      if (at > now && at < dayEnd) times.add(at.getTime());
    }
  }
  const planned: PlannedOperation[] = [];
  for (const time of [...times].sort((a, b) => a - b)) {
    const before = operationAt(new Date(time - 1000));
    const after = operationAt(new Date(time + 1000));
    const meta = schedulerMeta(before.active, after.active, workMode);
    const entry = plannedOperation(new Date(time), before.operation, after.operation, meta.reason ?? '', meta.conditions);
    if (entry) planned.push(entry);
  }
  return planned;
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
