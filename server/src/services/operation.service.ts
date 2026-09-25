
import { OperationEntry  } from '../middleware/type';

const operations = new Map<string, OperationEntry>();
const scheduledOperations = new Map<string, OperationEntry>();
const manualOperations = new Map<string, OperationEntry>();

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
  const operation = mergeWithManualOperation(
    rootId,
    scheduledOperations.get(rootId) ?? getOperationData(rootId),
  );
  operations.set(rootId, operation);
  return manualOperation;
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

  const scheduledOperation = scheduledOperations.get(rootId);
  if (scheduledOperation) {
    operations.set(rootId, { ...scheduledOperation });
  } else {
    operations.delete(rootId);
  }
};


