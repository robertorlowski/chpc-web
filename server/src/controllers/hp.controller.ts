import { Request, Response } from 'express'

import { addHpData, getHpLastData, getHpAllData, clearData } from '../services/hp.service'
import { HpEntry, OperationEntry } from '../middleware/type'
import { clearOperation, getOperationData } from '../services/operation.service'

export const clearHp = async (req: Request<{}, {}, {}>, res: Response) => {
  try {
    console.log("Clear HP data");
    const result = await clearData();
    return res.status(200).send({ message: 'OK' });
  } catch (error) {
    console.log()
    return res.status(500).send({ message: error })
  }
}


export async function getHp(req: Request, res: Response) {
  try {
    console.log("Get HP last data");
    const result = await getHpLastData()
    return res.status(200).send(result)
  } catch (error) {
    console.log(error)
    return res.status(500).send({ message: error })
  }
}

export async function getHpAll(req: Request, res: Response) {
  try {
    const result = await getHpAllData()
    console.log("Get HP all data");
    return res.status(200).send(result)
  } catch (error) {
    console.log(error)
    return res.status(500).send({ message: error })
  }
}

export const addHp = async (req: Request<{}, {}, HpEntry>, res: Response) => {
  const data :HpEntry = req.body;
  console.log("Add HP data");

  const operation: OperationEntry = Object.assign(getOperationData()); 
  console.log("Get HP operation");
  console.log(operation);
  try {   
    if (data && data.HP && data.HP.Ttarget) {
      await addHpData(data);
    }    
    console.log("Clear HP operation");
    clearOperation();    
    
    return res.status(201).json({ operation: operation});
  } catch (error) {
    return res.status(500).send({ error: error })
  }
}

