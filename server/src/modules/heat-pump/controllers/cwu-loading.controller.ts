// Ładowanie CWU w kotle (services/cwu-loading.service.ts). PUT ustawia kocioł (moduł pieca przez API,
// z rootId pompy), GET czyta ekran główny pompy. Zmiana stanu budzi sterownik co (WebSocket „operation”),
// żeby nowe temperatury poszły od razu, a nie przy cyklicznym /hp/add.
import { Request, Response } from 'express';
import { sendMessage } from '../../../core/websocket';
import {
  BOILER_BLOCK_MAX, BOILER_BLOCK_MIN, getBoilerBlockFrom, getCwuLoading, setBoilerCoPump, setCwuLoading,
} from '../services/cwu-loading.service';
import { DeviceModel } from '../../../core/models/device.model';
import { appUserMeta, logPropertiesChange, metaFromRequest } from '../../../core/services/operation-log.service';
import { heatPumpDeviceType } from '../device-type';

// GET /hp/cwu-loading → {active, since, pumpOff, pelletBlock, blockFrom, resumeBelow}
export async function getCwuLoadingState(req: Request, res: Response) {
  try {
    return res.status(200).json(await getCwuLoading(req.deviceRootId as string));
  } catch (error) {
    return res.status(500).json({ message: String(error) });
  }
}

// PUT /hp/boiler-block {temperature} — Ustawienia pompy: pompa stoi, gdy powiązany kocioł ma co najmniej tyle °C
// (pełne stopnie 40–70), i rusza 2 °C niżej. Tylko to pole (bez PUT /device/properties, który kasuje ręczne
// ustawienia pompy); kocioł dostaje próg przy najbliższym zgłoszeniu (do minuty).
export async function putBoilerBlock(req: Request<{}, {}, { temperature?: unknown }>, res: Response) {
  const temperature = req.body?.temperature;
  if (typeof temperature !== 'number' || !Number.isInteger(temperature) || temperature < BOILER_BLOCK_MIN || temperature > BOILER_BLOCK_MAX) {
    return res.status(400).json({ message: `Temperatura: pełne stopnie ${BOILER_BLOCK_MIN}–${BOILER_BLOCK_MAX} °C.` });
  }
  try {
    const rootId = req.deviceRootId as string;
    const before = await getBoilerBlockFrom(rootId);
    await DeviceModel.updateOne({ _id: rootId }, { $set: { 'properties.boiler_block_temp': temperature } });
    await logPropertiesChange(rootId, heatPumpDeviceType.propertyLabels, { boiler_block_temp: before }, { boiler_block_temp: temperature },
      metaFromRequest(req, appUserMeta('Ustawienia', 'Zapis „Wyłącz powyżej temp.” w Ustawieniach.')));
    return res.status(200).json(await getCwuLoading(rootId));
  } catch (error) {
    return res.status(500).json({ message: String(error) });
  }
}

// PUT /hp/cwu-loading {active: boolean, since?: ISO, co_pump?: boolean, pellet_block?: boolean} → {active, since, pumpOff, pelletBlock}
// co_pump: pompa CO kotła pracuje (co od 1.2.0 nie liczy wtedy COP, przy podłączeniu CO)
// pellet_block: kocioł grzeje CWU peletem — pompa wstrzymana (OFF) do jego ostygnięcia
export async function putCwuLoadingState(req: Request<{}, {}, { active?: unknown; since?: unknown; co_pump?: unknown; pellet_block?: unknown }>, res: Response) {
  const { active, since, co_pump: coPump, pellet_block: pelletBlock } = req.body ?? {};
  if (typeof active !== 'boolean') return res.status(400).json({ message: 'active: true albo false.' });
  if (coPump !== undefined && typeof coPump !== 'boolean') return res.status(400).json({ message: 'co_pump: true albo false.' });
  if (pelletBlock !== undefined && typeof pelletBlock !== 'boolean') return res.status(400).json({ message: 'pellet_block: true albo false.' });
  const start = typeof since === 'string' ? new Date(since) : undefined;
  if (start && Number.isNaN(start.getTime())) return res.status(400).json({ message: 'since: data ISO.' });
  try {
    const rootId = req.deviceRootId as string;
    if (typeof coPump === 'boolean') setBoilerCoPump(rootId, coPump);
    const { changed, status } = await setCwuLoading(rootId, active, start, new Date(), pelletBlock as boolean | undefined);
    if (changed) void sendMessage('operation', rootId);
    return res.status(200).json(status);
  } catch (error) {
    return res.status(500).json({ message: String(error) });
  }
}
