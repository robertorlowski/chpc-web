// Kafelki pogody na liście sterowników: GET /weather-tiles (lista z bieżącą pogodą), POST (nowy {name, lat, lon}),
// PUT /:id ({name?, lat?, lon?, hidden?}), DELETE /:id. Bez rootId. Kolejność razem ze sterownikami: PUT /devices/order.
import { Request, Response } from 'express';
import { createWeatherTile, listWeatherTiles, removeWeatherTile, updateWeatherTile } from '../services/weather-tile.service';

const fail = (res: Response, error: unknown) =>
  res.status(String(error).includes('not found') ? 404 : 400).json({ message: String(error) });

export async function getWeatherTiles(_req: Request, res: Response) {
  try {
    return res.status(200).json(await listWeatherTiles());
  } catch (error) {
    return res.status(500).json({ message: String(error) });
  }
}

export async function postWeatherTile(req: Request, res: Response) {
  try {
    return res.status(201).json(await createWeatherTile(req.body ?? {}));
  } catch (error) {
    return fail(res, error);
  }
}

export async function putWeatherTile(req: Request<{ id: string }>, res: Response) {
  try {
    return res.status(200).json(await updateWeatherTile(req.params.id, req.body ?? {}));
  } catch (error) {
    return fail(res, error);
  }
}

export async function deleteWeatherTile(req: Request<{ id: string }>, res: Response) {
  try {
    await removeWeatherTile(req.params.id);
    return res.status(204).end();
  } catch (error) {
    return fail(res, error);
  }
}
