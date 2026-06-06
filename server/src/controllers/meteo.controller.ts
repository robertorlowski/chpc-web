import { getTemperatureData } from "../services/meteo.service";
import { Request, Response } from 'express'

export async function getTemperature(req: Request, res: Response) {
  try {
    console.log("Get temperature data");
    const result = await getTemperatureData();
    console.log(result);
    return res.status(200).send( {temperature: result} );

  } catch (error) {
    console.log(error)
    return res.status(500).send({ message: error })
  }
}


