
import { OperationEntry  } from '../middleware/type';

const operations = new Map<string, OperationEntry>();

export const getOperationData = (rootId: string) => {
  return operations.get(rootId) ?? {};
}

export const clearOperation = (rootId: string) => {
  operations.delete(rootId);
  return;
}

export const setOperationData = (rootId: string, data :OperationEntry) => {
  const operation = { ...getOperationData(rootId), ...data };
  operations.set(rootId, operation);
  return operation;
}


