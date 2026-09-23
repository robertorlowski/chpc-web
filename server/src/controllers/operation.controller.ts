import { Request, Response } from 'express'
import { clearOperation, getOperationData, setManualOperationData } from '../services/operation.service';
import { OperationEntry } from '../middleware/type';
import { getHpLastData } from '../services/hp.service';


export async function prepareOperation(req: Request, res: Response) {
  try {
    console.log("Prepare operation");

    const data = await getHpLastData(req.deviceRootId as string)
    const op :OperationEntry = {};
    op.force = data.HP?.F ? "1" :"0";
    op.co_min = data?.co_min;
    op.co_max = data?.co_max;
    op.cwu_min = data?.cwu_min,
    op.cwu_max = data?.cwu_max,
    // op.cold_pomp = data?.HP?.CCS ? "1" : "0";
    // op.hot_pomp = data?.HP?.HCS ? "1" : "0";
    // op.sump_heater = data?.HP?.SHS ? "1" : "0";
    op.cold_pomp = "0";
    op.hot_pomp = "0";
    op.sump_heater = "0";
    op.co_pomp = "0"
    op.work_mode = data?.work_mode;
    op.eev_max_pulse_open = String(data?.HP?.EEVmax);
    op.eev_min_pulse_open = String(data?.HP?.EEVmin);
    op.working_watt = String(data?.HP?.WWatt);
    op.eev_setpoint = String(data?.HP?.EEV);
 
    return res.status(200).send(op);
  } catch (error) {
    return res.status(500).send({ error: error })
  }
}

export async function getOperation(req: Request, res: Response) {
  try { 
    console.log("Get operation");
    return res.status(200).send(getOperationData(req.deviceRootId as string));
  } catch (error) {
    return res.status(500).send({ error: error })
  }
}

export async function getAndClearOperation(req: Request, res: Response) {
  try { 
    console.log("Get & Clear operation");
    const operation: OperationEntry = {};
    Object.assign(operation, getOperationData(req.deviceRootId as string));
    clearOperation(req.deviceRootId as string);
    return res.status(200).send(operation);

  } catch (error) {
    return res.status(500).send({ error: error })
  }
}

export const setOperation = async (req: Request<{}, {}, OperationEntry>, res: Response) => {
  
  console.log("Set operation");
  
  const op :OperationEntry = req.body;
  console.log(op);
  setManualOperationData(req.deviceRootId as string, op);
  console.log(getOperationData(req.deviceRootId as string));

  return res.status(201).json({ message: op });
}
