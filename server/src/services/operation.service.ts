
import { TOperationCO } from '../middleware/type';

let operation: TOperationCO = {};

export const getOperationData = () => {
  return operation;
}

export const clearOperation = () => {
  operation = {};
  return;
}

export const setOperationData = (data :TOperationCO) => {
  Object.assign(operation, data);
  return operation;
}


