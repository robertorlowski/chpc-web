// Ładowanie CWU w kotle (services/cwu-loading.service.ts). PUT ustawia kocioł (moduł pieca przez API,
// z rootId pompy), GET czyta ekran główny pompy. Zmiana stanu budzi sterownik co (WebSocket „operation”),
// żeby nowe temperatury poszły od razu, a nie przy cyklicznym /hp/add.
import { Request, Response } from 'express';
import { sendMessage } from '../../../core/websocket';
import { getCwuLoading, setCwuLoading } from '../services/cwu-loading.service';

// GET /hp/cwu-loading → {active, since, pumpOff}
export async function getCwuLoadingState(req: Request, res: Response) {
  try {
    return res.status(200).json(await getCwuLoading(req.deviceRootId as string));
  } catch (error) {
    return res.status(500).json({ message: String(error) });
  }
}

// PUT /hp/cwu-loading {active: boolean, since?: ISO} → {active, since, pumpOff}
export async function putCwuLoadingState(req: Request<{}, {}, { active?: unknown; since?: unknown }>, res: Response) {
  const { active, since } = req.body ?? {};
  if (typeof active !== 'boolean') return res.status(400).json({ message: 'active: true albo false.' });
  const start = typeof since === 'string' ? new Date(since) : undefined;
  if (start && Number.isNaN(start.getTime())) return res.status(400).json({ message: 'since: data ISO.' });
  try {
    const rootId = req.deviceRootId as string;
    const { changed, status } = await setCwuLoading(rootId, active, start);
    if (changed) void sendMessage('operation', rootId);
    return res.status(200).json(status);
  } catch (error) {
    return res.status(500).json({ message: String(error) });
  }
}
