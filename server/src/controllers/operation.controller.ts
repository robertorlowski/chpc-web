import { Request, Response } from 'express'
import { setOperationData } from '../services/operation.service';
import { TOperationCO } from '../middleware/type';
import { getHpLastData } from '../services/hp.service';


export async function prepareOperation(req: Request, res: Response) {
  try {

    const data = await getHpLastData()
    const op :TOperationCO = {};
    op.force = data.HP?.F ? "1" :"0";
    op.co_min = data?.co_min;
    op.co_max = data?.co_max;
    op.cwu_min = data?.cwu_min,
    op.cwu_max = data?.cwu_max,
    op.cold_pomp = data?.HP?.CCS ? "1" : "0";
    op.hot_pomp = data?.HP?.HCS ? "1" : "0";
    op.sump_heater = data?.HP?.SHS ? "1" : "0";
    op.work_mode = data?.work_mode;
    op.eev_max_pulse_open = String(data?.HP?.EEVmax);
    op.working_watt = String(data?.HP?.WWatt);
 
    return res.status(200).send(op);
  } catch (error) {
    return res.status(500).send({ error: error })
  }
}

export const setOperation = async (req: Request<{}, {}, TOperationCO>, res: Response) => {
  const op :TOperationCO = req.body;
  setOperationData(op)
  return res.status(201).json({ message: op });
}

