// Wzór kafelka listy sterowników (projektant kafelka w aplikacji): GET zwraca zapisany wzór albo null,
// PUT zapisuje (400 przy złym wzorze), DELETE wraca do wzoru wbudowanego w klienta. Bez rootId.
import { Request, Response } from 'express';
import { getTileTemplate, resetTileTemplate, saveTileTemplate } from '../services/tile-template.service';

export async function getTileTemplateEntry(_req: Request, res: Response) {
  try {
    return res.status(200).json({ template: await getTileTemplate() });
  } catch (error) {
    return res.status(500).json({ message: String(error) });
  }
}

export async function putTileTemplateEntry(req: Request, res: Response) {
  try {
    return res.status(200).json({ template: await saveTileTemplate(req.body) });
  } catch (error) {
    return res.status(400).json({ message: String(error) });
  }
}

export async function deleteTileTemplateEntry(_req: Request, res: Response) {
  try {
    await resetTileTemplate();
    return res.status(200).json({ template: null });
  } catch (error) {
    return res.status(500).json({ message: String(error) });
  }
}
