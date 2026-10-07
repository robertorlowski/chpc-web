// GET /api/devices/db-stats: zajętość bazy dla stopki strony /devices (database.service.ts).
// Bez rootId (ścieżki /devices/… są publiczne względem kontekstu urządzenia). Brak połączenia = 503.
import { Request, Response } from 'express';
import { getDatabaseStats } from '../services/database.service';

export async function getDatabaseStatsEntry(_req: Request, res: Response) {
  try {
    return res.status(200).json(await getDatabaseStats());
  } catch (error) {
    console.error(error);
    return res.status(503).json({ ok: false, message: String((error as Error)?.message ?? error) });
  }
}
