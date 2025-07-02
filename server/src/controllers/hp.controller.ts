import { Request, Response } from 'express'

import { getHpLast, addHpData } from '../services/hp.service'
import { TCO } from '../middleware/type'

export async function getHp(req: Request, res: Response) {
  try {
    const result = await getHpLast()
    return res.status(200).send(result)
  } catch (error) {
    console.log(error)
    return res.status(500).send({ message: 'Something went wrong' })
  }
}


export const addHp = async (req: Request<{}, {}, TCO>, res: Response) => {
  const data :TCO = req.body;
  try {
    await addHpData(data);
    return res.status(201).json({ message: data });
  } catch (error) {
    return res.status(500).send({ error: error })
  }
}

