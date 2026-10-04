// GET /api/temperature: temperatura zewnętrzna z czujnika kotła z pamięci ({temperature: null}
// bez świeżego pomiaru). Wymaga rootId jak inne trasy, choć go nie używa.
import { getTemperature as getTemperatureData } from "../services/meteo.service";
import { Request, Response } from 'express'

export async function getTemperature(req: Request, res: Response) {
  try {
    console.log("Get temperature data");
    const result = getTemperatureData();
    return res.status(200).send( {temperature: result } );

  } catch (error) {
    console.log(error)
    return res.status(500).send({ message: error })
  }
}


