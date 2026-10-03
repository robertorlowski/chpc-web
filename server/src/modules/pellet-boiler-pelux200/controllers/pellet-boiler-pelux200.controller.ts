// Endpointy kotła Pellux 200 (/pellet-boiler-pelux200/...): zapis odczytu od
// sterownika pieca, ostatni odczyt, lista z jednego dnia (doba warszawska) i ustawienia
// regulatora (zapis surowych odpowiedzi od sterownika, odczyt rozkodowany).
import { Request, Response } from 'express';
import { formatInTimeZone } from 'date-fns-tz';
import {
  addPelletBoilerPelux200Reading, getPelletBoilerPelux200Last, getPelletBoilerPelux200Range,
  getPollIntervalSeconds, validateReading,
} from '../services/pellet-boiler-pelux200.service';
import {
  getPelletBoilerSettingsView, savePelletBoilerSettings, validateSettingsUpload,
} from '../services/pellet-boiler-pelux200-settings.service';
import { TIME_ZONE, warsawDayBoundsUTC } from '../../../core/time';

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
