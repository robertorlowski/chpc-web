
import { OperationEntry  } from '../middleware/type';

let operation: OperationEntry = {};

export const getOperationData = () => {
  return operation;
}

export const clearOperation = () => {
  operation = Object.assign({});
  return;
}

export const setOperationData = (data :OperationEntry) => {
  operation = {...operation, ...data };	
  return operation;
}


