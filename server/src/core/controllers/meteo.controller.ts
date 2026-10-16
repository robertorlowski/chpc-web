// GET /api/temperature: {temperature, temperatureSource, weather} z pamięci — temperatura z czujnika kotła albo
// (bez świeżego pomiaru) z prognozy Open-Meteo (temperatureSource: boiler | forecast), pogoda od sterownika
// włącznika (od 1.1.3); null w polach bez świeżych danych. Bez rootId: czyta ją lista urządzeń
// (core/middleware/device-context.ts, publicPaths).
import { getOutdoor, getWeather } from "../services/meteo.service";
import { Request, Response } from 'express'

export async function getTemperature(req: Request, res: Response) {
  try {
    const outdoor = getOutdoor();
    return res.status(200).send({
      temperature: outdoor?.temperature ?? null, temperatureSource: outdoor?.source ?? null, weather: getWeather(),
    });
  } catch (error) {
    console.log(error)
    return res.status(500).send({ message: error })
  }
}
