// Firmware sterowników (OTA), endpointy /api/firmware/... (publiczne względem
// kontekstu urządzenia, bez rootId): strona /firmware w kliencie wgrywa plik
// i ustawia ofertę, sterownik pobiera plik pod adresem z oferty.
// Autoryzacji na razie nie ma (jak w całym API, core/app.ts).
import { Request, Response } from 'express';
import { getDeviceTypeModule } from '../device-types';
import {
  FirmwareError, activateFirmware, deleteFirmwareImage, getFirmwareFile, getFirmwareSummary,
  saveFirmwareImage, setFirmwareEnabled,
} from '../services/firmware.service';
import { DeviceType } from '../types';

// Adres serwera widziany z zewnątrz (za proxy Render: trust proxy w app.ts).
export const serverBaseUrl = (req: Request) => `${req.protocol}://${req.get('host')}`;

const fail = (res: Response, error: unknown) => {
  if (error instanceof FirmwareError) return res.status(error.status).json({ message: error.message });
  return res.status(500).json({ message: String(error) });
};

// Tylko rodzaje, które mają aktualizacje przez sieć (device-type.ts: firmwareUpdates).
function resolveType(req: Request, res: Response): DeviceType | undefined {
  const type = req.params.deviceType as DeviceType;
  if (!Object.values(DeviceType).includes(type) || !getDeviceTypeModule(type).firmwareUpdates) {
    res.status(404).json({ message: 'Ten rodzaj sterownika nie ma aktualizacji firmware.' });
    return undefined;
  }
  return type;
}

// GET /firmware/:deviceType — {enabled, version, previousVersion, images[]}
export async function getFirmware(req: Request, res: Response) {
  const type = resolveType(req, res);
  if (!type) return;
  try {
    return res.status(200).json(await getFirmwareSummary(type));
  } catch (error) {
    return fail(res, error);
  }
}

// PUT /firmware/:deviceType/:version?description= — treść pliku (application/octet-stream).
// Zapisuje obraz z opisem wersji i ustawia go jako oferowany.
export async function uploadFirmware(req: Request, res: Response) {
  const type = resolveType(req, res);
  if (!type) return;
  if (!Buffer.isBuffer(req.body)) {
    return res.status(400).json({ message: 'Treść żądania to plik .bin (Content-Type: application/octet-stream).' });
  }
  try {
    const description = typeof req.query.description === 'string' ? req.query.description.trim() : '';
    await saveFirmwareImage(type, req.params.version, req.body, description);
    return res.status(200).json(await getFirmwareSummary(type));
  } catch (error) {
    return fail(res, error);
  }
}

// PUT /firmware/:deviceType {enabled?, version?} — włączenie/wyłączenie oferty
// i przywrócenie wersji, której plik jest jeszcze w bazie.
export async function updateFirmwareOffer(
  req: Request<{ deviceType: string }, {}, { enabled?: boolean; version?: string }>,
  res: Response,
) {
  const type = resolveType(req as unknown as Request, res);
  if (!type) return;
  const { enabled, version } = req.body ?? {};
  if (enabled !== undefined && typeof enabled !== 'boolean') {
    return res.status(400).json({ message: 'enabled musi być wartością logiczną.' });
  }
  if (version !== undefined && typeof version !== 'string') {
    return res.status(400).json({ message: 'version musi być tekstem.' });
  }
  try {
    if (version !== undefined) await activateFirmware(type, version);
    if (enabled !== undefined) await setFirmwareEnabled(type, enabled);
    return res.status(200).json(await getFirmwareSummary(type));
  } catch (error) {
    return fail(res, error);
  }
}

// DELETE /firmware/:deviceType/:version — usuwa plik wersji, która nie jest oferowana.
export async function deleteFirmware(req: Request, res: Response) {
  const type = resolveType(req, res);
  if (!type) return;
  try {
    await deleteFirmwareImage(type, req.params.version);
    return res.status(200).json(await getFirmwareSummary(type));
  } catch (error) {
    return fail(res, error);
  }
}

// GET /firmware/:deviceType/:version.bin — plik dla sterownika i przycisk „Pobierz”.
export async function downloadFirmware(req: Request, res: Response) {
  const type = resolveType(req, res);
  if (!type) return;
  const name = req.params.version;
  if (!name.endsWith('.bin')) return res.status(404).json({ message: 'Nie znaleziono pliku.' });
  try {
    const image = await getFirmwareFile(type, name.slice(0, -4));
    if (!image) return res.status(404).json({ message: 'Nie znaleziono pliku.' });
    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(image.size),
      'Content-Disposition': `attachment; filename="${type}-${image.version}.bin"`,
    });
    return res.status(200).send(Buffer.from((image.data as unknown as { buffer: Uint8Array }).buffer));
  } catch (error) {
    return fail(res, error);
  }
}
