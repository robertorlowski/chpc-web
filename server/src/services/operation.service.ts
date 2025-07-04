
import { TOperationCO } from '../middleware/type';

let operation: TOperationCO = {};

export const getOperationData = () => {
  return operation;
}

export const setOperationData = (data :TOperationCO) => {
  operation = data;
  return operation;
}


