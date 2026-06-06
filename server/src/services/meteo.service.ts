import { prepareMeteoData } from '../middleware/openmeteo';


export const getTemperatureData = async () => {
  return await prepareMeteoData();
}
