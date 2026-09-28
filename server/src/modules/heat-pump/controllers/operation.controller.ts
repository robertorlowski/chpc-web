// Operacje pompy (/operation...): formularz Ustawień w kliencie, ręczne nadpisania
// (/operation/set) i akcje jednorazowe (/operation/action). Stan operacji jest
// tylko w pamięci (services/operation.service.ts); do sterownika trafia przez /hp/add.
import { Request, Response } from 'express'
import { addOperationAction, clearOperation, getOperationData, OPERATION_ACTIONS, OperationAction, setManualOperationData } from '../services/operation.service';
import { OperationEntry } from '../types';
import { getHpLastData } from '../services/hp.service';
import { sendMessage } from '../../../core/websocket';


// GET /operation: wartości początkowe formularza Ustawień z ostatniej telemetrii
// (rzeczywisty stan pompy), a nie z przygotowanej operacji. Bez telemetrii pola
// EEV i mocy mają wartość "undefined" (String(undefined)).
export async function prepareOperation(req: Request, res: Response) {
  try {
    console.log("Prepare operation");

    const data = await getHpLastData(req.deviceRootId as string)
    const op :OperationEntry = {};
    // HP.F: wymuszenie w CHPC, trwa od ustawienia do zatrzymania sprężarki
    op.force = data.HP?.F ? "1" :"0";
    op.co_min = data?.co_min;
    op.co_max = data?.co_max;
    op.cwu_min = data?.cwu_min,
    op.cwu_max = data?.cwu_max,
    // rzeczywisty stan pomp: praca automatyczna, włączenie komendą albo ochrona przed mrozem
    op.cold_pomp = data?.HP?.CCS ? "1" : "0";
    op.hot_pomp = data?.HP?.HCS ? "1" : "0";
    // op.sump_heater = data?.HP?.SHS ? "1" : "0";
    op.sump_heater = "0";
    // rzeczywisty stan przekaźników CO/CWU zgłoszony przez co, nie ostatnie ustawienie
    op.co_pomp = data?.co_pomp ? "1" : "0";
    op.work_mode = data?.work_mode;
    op.eev_max_pulse_open = String(data?.HP?.EEVmax);
    op.eev_min_pulse_open = String(data?.HP?.EEVmin);
    op.working_watt = String(data?.HP?.WWatt);
    // HP.EEV to zadane przegrzanie EEV (komenda 0x08), stąd eev_setpoint
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

// Starszy sposób odbioru operacji (poza /hp/add); kasuje ją, więc sterownik co
// jej już nie dostanie. Klient i obecny co go nie używają.
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

// POST /operation/set: ręczne nadpisanie (przycisk „Zmień” w Ustawieniach). Bez walidacji
// zakresów: wartości przycina dopiero co i CHPC. Sterownik dostanie je przy najbliższym
// cyklicznym /hp/add (10–30 s), bo tu nie ma komunikatu WebSocket.
export const setOperation = async (req: Request<{}, {}, OperationEntry>, res: Response) => {
  
  console.log("Set operation");
  
  const op :OperationEntry = req.body;
  console.log(op);
  setManualOperationData(req.deviceRootId as string, op);
  console.log(getOperationData(req.deviceRootId as string));

  return res.status(201).json({ message: op });
}

// POST /api/operation/action { action: 'error_reset' | 'restart' }
// Akcja trafia do sterownika raz, przy najbliższym /hp/add. Komunikat WebSocket
// "operation" budzi sterownik, żeby wysłał telemetrię od razu, a nie po 10-30 s.
export const setOperationAction = async (req: Request<{}, {}, { action?: string }>, res: Response) => {
  const action = req.body?.action as OperationAction;
  if (!OPERATION_ACTIONS.includes(action)) {
    return res.status(400).json({ message: `Nieznana akcja: ${req.body?.action}` });
  }

  const rootId = req.deviceRootId as string;
  addOperationAction(rootId, action);
  sendMessage('operation', rootId);
  return res.status(201).json({ action });
}
