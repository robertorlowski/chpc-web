
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
  const merged = {...operation, ...data };	
  operation = merged;
  return operation;
}


