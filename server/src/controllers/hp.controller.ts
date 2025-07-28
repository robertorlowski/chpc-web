import { Request, Response } from 'express'

import { addHpData, getHpLastData, getHpAllData, clearData } from '../services/hp.service'
import { TCO, TOperationCO } from '../middleware/type'
import { clearOperation, getOperationData } from '../services/operation.service'
import { sendMessage } from '../middleware/webSocet'


export const clearHp = async (req: Request<{}, {}, {}>, res: Response) => {
  try {
    const result = await clearData();
    console.log("Clear HP data");
    return res.status(200).send({ message: 'OK' });
  } catch (error) {
    console.log(error)
    return res.status(500).send({ message: 'Something went wrong' })
  }
}


export async function getHp(req: Request, res: Response) {
  try {
    const result = await getHpLastData()
    console.log("Get HP last data");
    return res.status(200).send(result)
  } catch (error) {
    console.log(error)
    return res.status(500).send({ message: 'Something went wrong' })
  }
}

export async function getHpAll(req: Request, res: Response) {
  try {
    const result = await getHpAllData()
    console.log("Clear HP all data");
    return res.status(200).send(result)
  } catch (error) {
    console.log(error)
    return res.status(500).send({ message: 'Something went wrong' })
  }
}

export const addHp = async (req: Request<{}, {}, TCO>, res: Response) => {
  const data :TCO = req.body;
  
  console.log("Add HP data");
  const operation: TOperationCO = {};
  Object.assign(operation, getOperationData());
  console.log("Get HP operation");
  console.log(operation);
  clearOperation();
  console.log("Clear HP operation");

  try {   
    if (data && data.HP && data.HP.Ttarget) {
      await addHpData(data);
      sendMessage('update');
    }    
    
    return res.status(201).json({ operation: operation});
  } catch (error) {
    return res.status(500).send({ error: error })
  }
}

