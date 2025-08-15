import { Request, Response } from 'express'
import { clearOperation, getOperationData, setOperationData } from '../services/operation.service';
import { OperationEntry } from '../middleware/type';
import { getHpLastData } from '../services/hp.service';
import { sendMessage } from '../middleware/webSocet';


export async function prepareOperation(req: Request, res: Response) {
  try {
    console.log("Prepare operation");

    const data = await getHpLastData()
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
    op.work_mode = data?.work_mode;
    op.eev_max_pulse_open = String(data?.HP?.EEVmax);
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
    return res.status(200).send(getOperationData());
  } catch (error) {
    return res.status(500).send({ error: error })
  }
}

export async function getAndClearOperation(req: Request, res: Response) {
  try { 
    console.log("Get & Clear operation");
    const operation: OperationEntry = {};
    Object.assign(operation, getOperationData());
    clearOperation();
    return res.status(200).send(operation);

  } catch (error) {
    return res.status(500).send({ error: error })
  }
}

export const setOperation = async (req: Request<{}, {}, OperationEntry>, res: Response) => {
  
  console.log("Set operation");
  
  const op :OperationEntry = req.body;
  console.log(op);
  setOperationData(op)
  console.log(getOperationData());

  sendMessage("operation");
  return res.status(201).json({ message: op });
}

