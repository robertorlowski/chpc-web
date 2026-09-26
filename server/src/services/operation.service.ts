
import { OperationEntry  } from '../middleware/type';

const operations = new Map<string, OperationEntry>();
const scheduledOperations = new Map<string, OperationEntry>();
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

export const replaceOperationData = (rootId: string, data: OperationEntry) => {
  scheduledOperations.set(rootId, { ...data });
  const operation = mergeWithManualOperation(rootId, data);
  operations.set(rootId, operation);
  return operation;
};

export const setOperationData = (rootId: string, data :OperationEntry) => {
  const operation = { ...getOperationData(rootId), ...data };
  operations.set(rootId, operation);
  return operation;
}

export const getManualOperationData = (rootId: string) => {
  return manualOperations.get(rootId) ?? {};
};

export const setManualOperationData = (rootId: string, data: OperationEntry) => {
  const manualOperation = {
    ...getManualOperationData(rootId),
    ...data,
  };

  manualOperations.set(rootId, manualOperation);
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


