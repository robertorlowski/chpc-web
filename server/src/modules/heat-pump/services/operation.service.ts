
// Operacje dla sterownika co, tylko w pamięci procesu (restart serwera je kasuje).
// Scheduler ustawia operację wyliczoną (replaceOperationData), użytkownik — ręczne
// nadpisania (setManualOperationData), a /hp/add odbiera bieżącą i ją czyści.
// Ręczne pola wygrywają: { ...scheduled, ...manual }.
import { OperationEntry  } from '../types';

// operacja do wysłania w najbliższej odpowiedzi /hp/add
const operations = new Map<string, OperationEntry>();
// ostatnia operacja wyliczona przez scheduler
const scheduledOperations = new Map<string, OperationEntry>();
// ręczne nadpisania z /operation/set (tylko przekazane pola)
const manualOperations = new Map<string, OperationEntry>();
// Ręczne force: czy od jego ustawienia telemetria pokazała sprężarkę w spoczynku.
const manualForceSeenIdle = new Map<string, boolean>();

const mergeWithManualOperation = (rootId: string, operation: OperationEntry) => ({
  ...operation,
  ...(manualOperations.get(rootId) ?? {}),
});

export const getOperationData = (rootId: string) => {
  return operations.get(rootId) ?? {};
}

// Po obsłużeniu /hp/add. Przy ręcznych nadpisaniach operacja od razu wraca (każda
// odpowiedź niesie pełny stan z nadpisaniem); bez nich jest pusta do przebiegu schedulera.
export const clearOperation = (rootId: string) => {
  operations.delete(rootId);

  const manualOperation = manualOperations.get(rootId);
  if (manualOperation) {
    operations.set(
      rootId,
      mergeWithManualOperation(rootId, scheduledOperations.get(rootId) ?? manualOperation),
    );
  }

  return;
}

// Wołane przez scheduler co minutę: nowa operacja wyliczona, z nałożonymi ręcznymi polami.
export const replaceOperationData = (rootId: string, data: OperationEntry) => {
  scheduledOperations.set(rootId, { ...data });
  const operation = mergeWithManualOperation(rootId, data);
  operations.set(rootId, operation);
  return operation;
};

// Doklejenie pól do bieżącej operacji (co_pomp "1" po zapisie ustawień domyślnych, device-type.ts).
export const setOperationData = (rootId: string, data :OperationEntry) => {
  const operation = { ...getOperationData(rootId), ...data };
  operations.set(rootId, operation);
  return operation;
}

export const getManualOperationData = (rootId: string) => {
  return manualOperations.get(rootId) ?? {};
};

// Zmiana trybu pracy bez co_pomp przywraca pompy CO/CWU ("1"). Samo usunięcie klucza
// nie wystarczy: co trzyma ostatnią przysłaną wartość, więc ręczne "0" wyłączałoby
// przekaźniki także po zmianie trybu i restarcie sterownika, aż do ręcznego "1".
export const setManualOperationData = (rootId: string, data: OperationEntry) => {
  const manualOperation = {
    ...getManualOperationData(rootId),
    ...(data.work_mode !== undefined ? { co_pomp: '1' } : {}),
    ...data,
  };

  manualOperations.set(rootId, manualOperation);
  // nowe force: zdjęcie po starcie wymaga najpierw odczytu w spoczynku
  // (force ustawione w trakcie pracy czeka na postój i kolejny start)
  if (data.force !== undefined) manualForceSeenIdle.set(rootId, false);
  const operation = mergeWithManualOperation(
    rootId,
    scheduledOperations.get(rootId) ?? getOperationData(rootId),
  );
  operations.set(rootId, operation);
  return manualOperation;
};

// Ręczne force: "1" jest jednorazowe. Znika z ręcznych nadpisań przy pierwszym starcie
// sprężarki (HPS: spoczynek -> praca) po jego ustawieniu; wraca force z harmonogramu
// (forceStart na czas wpisu) albo domyślne "0". Bez tego co wymuszał start po każdym
// zatrzymaniu, bo CHPC kasuje force przy stopie, a serwer wciąż przysyłał "1".
// Wywoływane po clearOperation, więc ustawiona tu operacja idzie w następnej odpowiedzi.
export const consumeManualForceOnStart = (rootId: string, running: boolean) => {
  const manualOperation = manualOperations.get(rootId);
  if (manualOperation?.force !== '1') return false;
  if (!running) {
    manualForceSeenIdle.set(rootId, true);
    return false;
  }
  if (!manualForceSeenIdle.get(rootId)) return false;

  manualForceSeenIdle.delete(rootId);
  const { force: _force, ...rest } = manualOperation;
  if (Object.keys(rest).length > 0) {
    manualOperations.set(rootId, rest);
  } else {
    manualOperations.delete(rootId);
  }
  // jawne force: co trzyma ostatnią przysłaną wartość, więc samo usunięcie klucza nie wystarczy
  // (bez przebiegu schedulera bieżąca operacja wciąż zawiera ręczne "1")
  const scheduled = scheduledOperations.get(rootId);
  const base = scheduled ? { force: '0', ...scheduled } : { ...getOperationData(rootId), force: '0' };
  operations.set(rootId, mergeWithManualOperation(rootId, base));
  return true;
};

// Zmienia tryb w ręcznym nadpisaniu (np. M -> A po północy). Bieżącą operację
// odświeży najbliższy replaceOperationData schedulera.
export const switchManualWorkMode = (rootId: string, from: string, to: string) => {
  const manualOperation = manualOperations.get(rootId);
  if (manualOperation?.work_mode !== from) return false;

  manualOperations.set(rootId, { ...manualOperation, work_mode: to });
  return true;
};

// Akcje jednorazowe dla sterownika: nie są scalane z operacją ręczną ani harmonogramem,
// trafiają do jednej odpowiedzi na /hp/add i znikają.
export type OperationAction = 'error_reset' | 'restart';
export const OPERATION_ACTIONS: OperationAction[] = ['error_reset', 'restart'];
const pendingActions = new Map<string, OperationEntry>();

export const addOperationAction = (rootId: string, action: OperationAction) => {
  const actions = { ...(pendingActions.get(rootId) ?? {}), [action]: '1' };
  pendingActions.set(rootId, actions);
  return actions;
};

export const takeOperationActions = (rootId: string): OperationEntry => {
  const actions = pendingActions.get(rootId) ?? {};
  pendingActions.delete(rootId);
  return actions;
};

// Usuwa ręczne nadpisania; scheduler woła to przy przejściu z aktywnego harmonogramu
// do braku harmonogramu, a zapis ustawień domyślnych przez onPropertiesSaved (device-type.ts).
export const clearManualOperation = (rootId: string) => {
  manualOperations.delete(rootId);
  manualForceSeenIdle.delete(rootId);

  const scheduledOperation = scheduledOperations.get(rootId);
  if (scheduledOperation) {
    operations.set(rootId, { ...scheduledOperation });
  } else {
    operations.delete(rootId);
  }
};


