
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

export const clearManualOperation = (rootId: string) => {
  manualOperations.delete(rootId);

  const scheduledOperation = scheduledOperations.get(rootId);
  if (scheduledOperation) {
    operations.set(rootId, { ...scheduledOperation });
  } else {
    operations.delete(rootId);
  }
};


