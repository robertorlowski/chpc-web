import { Request, Response } from 'express'
import { getOperationData, setOperationData } from '../services/operation.service';
import { TOperationCO } from '../middleware/type';


export async function getOperation(req: Request, res: Response) {
  try {
    return res.status(200).send(getOperationData())
  } catch (error) {
    return res.status(500).send({ error: error })
  }
}

export const setOperation = async (req: Request<{}, {}, TOperationCO>, res: Response) => {
  const op :TOperationCO = req.body;
  setOperationData(op)
  return res.status(201).json({ message: op });
}
