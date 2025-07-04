import { Request, Response } from 'express'

import { addHpData, getHpLastData, getHpAllData } from '../services/hp.service'
import { TCO, TOperationCO } from '../middleware/type'
import { getOperationData } from '../services/operation.service'

export async function getHp(req: Request, res: Response) {
  try {
    const result = await getHpLastData()
    return res.status(200).send(result)
  } catch (error) {
    console.log(error)
    return res.status(500).send({ message: 'Something went wrong' })
  }
}

export async function getHpAll(req: Request, res: Response) {
  try {
    const result = await getHpAllData()
    
    return res.status(200).send(result)
  } catch (error) {
    console.log(error)
    return res.status(500).send({ message: 'Something went wrong' })
  }
}

export const addHp = async (req: Request<{}, {}, TCO>, res: Response) => {
  const data :TCO = req.body;
  const operation: TOperationCO = {};
  Object.assign(operation, getOperationData());

  try {
    if (!data || !data?.HP) {
      return res.status(500).send({ error: "No data" })  
    }
    await addHpData(data);
    return res.status(201).json({ operation: operation});
  } catch (error) {
    return res.status(500).send({ error: error })
  }
}

