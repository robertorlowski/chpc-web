// Endpointy kotła Pellux 200 (/pellet-boiler-pelux200/...): zapis odczytu od
// sterownika pieca, ostatni odczyt, lista z jednego dnia (doba warszawska) i ustawienia
// regulatora (zapis surowych odpowiedzi od sterownika, odczyt rozkodowany) oraz zlecenia zmiany
// parametrów z aplikacji (odbiera i potwierdza je sterownik).
import { Request, Response } from 'express';
import { formatInTimeZone } from 'date-fns-tz';
import {
  addPelletBoilerPelux200Reading, getPelletBoilerPelux200Last, getPelletBoilerPelux200Range,
  getPollIntervalSeconds, validateReading,
} from '../services/pellet-boiler-pelux200.service';
import {
  getPelletBoilerSettingsView, savePelletBoilerSettings, validateSettingsUpload,
} from '../services/pellet-boiler-pelux200-settings.service';
import {
  CommandError, createCommands, finishCommand, listRecentCommands, takeNextCommand,
} from '../services/pellet-boiler-pelux200-command.service';
import {
  createScheduleEntry, getCurrentSchedule, getScheduleSettings, listScheduleEntries, parseScheduleEntry,
  parseScheduleSettings, removeScheduleEntry, replaceScheduleEntry, saveScheduleSettings,
} from '../services/pellet-boiler-pelux200-schedule.service';
import { TIME_ZONE, warsawDayBoundsUTC } from '../../../core/time';
import { firmwareOfferForRoot } from '../../../core/services/firmware.service';
import { serverBaseUrl } from '../../../core/controllers/firmware.controller';

// Odpowiedź niesie aktualny odstęp odpytywania: sterownik stosuje go od razu,
// więc zmiana w aplikacji dociera bez ponownego zgłoszenia.
export async function addPelletBoilerPelux200(req: Request, res: Response) {
  const reading = validateReading(req.body);
  if (!reading) return res.status(400).json({ message: 'Nieprawidłowy odczyt kotła.' });

  try {
    const rootId = req.deviceRootId as string;
    await addPelletBoilerPelux200Reading(rootId, reading);
    return res.status(201).json({ poll_interval_seconds: await getPollIntervalSeconds(rootId) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: String(error) });
  }
}

export async function getPelletBoilerPelux200(req: Request, res: Response) {
  try {
    const last = await getPelletBoilerPelux200Last(req.deviceRootId as string);
    return res.status(200).json(last ?? {});
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: String(error) });
  }
}

// Ustawienia regulatora od sterownika pieca (surowe odpowiedzi hex) — zapis ostatniego odczytu.
export async function addPelletBoilerPelux200Settings(req: Request, res: Response) {
  const raw = validateSettingsUpload(req.body);
  if (!raw) return res.status(400).json({ message: 'Nieprawidłowe ustawienia kotła.' });
  try {
    await savePelletBoilerSettings(req.deviceRootId as string, raw);
    return res.status(201).json({});
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: String(error) });
  }
}

// Ostatni odczyt ustawień rozkodowany do panelu „Ustawienia zaawansowane”; {} gdy brak.
export async function getPelletBoilerPelux200Settings(req: Request, res: Response) {
  try {
    const view = await getPelletBoilerSettingsView(req.deviceRootId as string);
    return res.status(200).json(view ?? {});
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: String(error) });
  }
}

// ?date=YYYY-MM-DD (domyślnie dziś w Warszawie), od najnowszego.
export async function getPelletBoilerPelux200List(req: Request, res: Response) {
  const { date } = req.query;
  if (date !== undefined && (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
    return res.status(400).json({ message: 'date: YYYY-MM-DD.' });
  }
  try {
    const day = (date as string | undefined) ?? formatInTimeZone(new Date(), TIME_ZONE, 'yyyy-MM-dd');
    const { startUTC, endUTC } = warsawDayBoundsUTC(day);
    const list = await getPelletBoilerPelux200Range(req.deviceRootId as string, startUTC, endUTC);
    return res.status(200).json(list);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: String(error) });
  }
}

// --- zmiana parametrów z aplikacji (pellet-boiler-pelux200-command.service.ts) ---

const commandError = (res: Response, error: unknown) => {
  if (error instanceof CommandError) return res.status(400).json({ message: error.message });
  console.error(error);
  return res.status(500).json({ message: String(error) });
};

// POST /commands (aplikacja): {changes: [{kind, mixer?, index, value}]} → 201 z utworzonymi zleceniami.
export async function addPelletBoilerPelux200Commands(req: Request, res: Response) {
  try {
    return res.status(201).json(await createCommands(req.deviceRootId as string, req.body));
  } catch (error) {
    return commandError(res, error);
  }
}

// GET /commands (aplikacja): ostatnie zlecenia od najnowszego.
export async function getPelletBoilerPelux200Commands(req: Request, res: Response) {
  try {
    return res.status(200).json(await listRecentCommands(req.deviceRootId as string));
  } catch (error) {
    return commandError(res, error);
  }
}

// GET /commands/next (sterownik, sam deviceId): {id, kind, mixer, index, value} albo {}.
// Przy zleceniu „Aktualizuj” zamiast zlecenia parametru idzie {firmware: {version, url, sha256, request}}
// (core/services/firmware.service.ts); zlecenia parametrów czekają do końca aktualizacji.
export async function getPelletBoilerPelux200NextCommand(req: Request, res: Response) {
  try {
    const firmware = await firmwareOfferForRoot(req.deviceRootId as string, serverBaseUrl(req));
    if (firmware) return res.status(200).json({ firmware });
    const command = await takeNextCommand(req.deviceRootId as string);
    if (!command) return res.status(200).json({});
    return res.status(200).json({
      id: String(command._id), kind: command.kind, mixer: command.mixer ?? 0, index: command.index, value: command.value,
    });
  } catch (error) {
    return commandError(res, error);
  }
}

// POST /commands/result (sterownik): {id, ok, error?}; 404, gdy zlecenia nie ma albo już ma wynik.
export async function addPelletBoilerPelux200CommandResult(req: Request, res: Response) {
  try {
    const updated = await finishCommand(req.deviceRootId as string, req.body);
    return updated ? res.status(201).json({}) : res.status(404).json({ message: 'Brak takiego zlecenia w toku.' });
  } catch (error) {
    return commandError(res, error);
  }
}

// --- harmonogram (pellet-boiler-pelux200-schedule.service.ts) ---

const scheduleError = (res: Response, error: unknown) => {
  console.error(error);
  return res.status(500).json({ message: String(error) });
};

export async function getPelletBoilerScheduleSettings(req: Request, res: Response) {
  try {
    return res.status(200).json(await getScheduleSettings(req.deviceRootId as string));
  } catch (error) {
    return scheduleError(res, error);
  }
}

export async function putPelletBoilerScheduleSettings(req: Request, res: Response) {
  const input = parseScheduleSettings(req.body);
  if (typeof input === 'string') return res.status(400).json({ message: input });
  try {
    return res.status(200).json(await saveScheduleSettings(req.deviceRootId as string, input));
  } catch (error) {
    return scheduleError(res, error);
  }
}

// GET /schedules/current: {enabled, state, seasonScheduleId, cwuScheduleId, lastError}
export async function getPelletBoilerCurrentSchedule(req: Request, res: Response) {
  try {
    return res.status(200).json(await getCurrentSchedule(req.deviceRootId as string));
  } catch (error) {
    return scheduleError(res, error);
  }
}

export async function getPelletBoilerSchedules(req: Request, res: Response) {
  try {
    return res.status(200).json(await listScheduleEntries(req.deviceRootId as string));
  } catch (error) {
    return scheduleError(res, error);
  }
}

export async function postPelletBoilerSchedule(req: Request, res: Response) {
  const entry = parseScheduleEntry(req.body);
  if (typeof entry === 'string') return res.status(400).json({ message: entry });
  try {
    return res.status(201).json(await createScheduleEntry(req.deviceRootId as string, entry));
  } catch (error) {
    return scheduleError(res, error);
  }
}

export async function putPelletBoilerSchedule(req: Request<{ id: string }>, res: Response) {
  const entry = parseScheduleEntry(req.body);
  if (typeof entry === 'string') return res.status(400).json({ message: entry });
  try {
    const updated = await replaceScheduleEntry(req.deviceRootId as string, req.params.id, entry);
    return updated ? res.status(200).json(updated) : res.status(404).json({ message: 'Nie znaleziono harmonogramu.' });
  } catch {
    return res.status(400).json({ message: 'Nieprawidłowy identyfikator harmonogramu.' });
  }
}

export async function deletePelletBoilerSchedule(req: Request<{ id: string }>, res: Response) {
  try {
    const removed = await removeScheduleEntry(req.deviceRootId as string, req.params.id);
    return removed ? res.status(200).json({}) : res.status(404).json({ message: 'Nie znaleziono harmonogramu.' });
  } catch {
    return res.status(400).json({ message: 'Nieprawidłowy identyfikator harmonogramu.' });
  }
}
