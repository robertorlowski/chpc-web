import 'dotenv/config';
import http from 'http';
import app from './middleware/app'
import { createWsServer } from './middleware/webSocet';
import mongoose from 'mongoose';
import { prepareMeteoData } from './services/meteo.service';
import { startScheduler } from './services/scheduler.service';
import { removeExpiredPanelDetails } from './services/pv.service';

const PANEL_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

const cleanPanelDetails = async () => {
  try {
    const cleaned = await removeExpiredPanelDetails();
    if (cleaned > 0) console.log(`Usunięto szczegóły paneli z ${cleaned} odczytów PV`);
  } catch (error) {
    console.error(error);
  }
};


const server = http.createServer(app);
createWsServer(server);

const MONGODB_URI =  process.env.MONGODB_URI ?? "mongodb+srv://hp:QzzlrWEruB3ZbE2S@hp.e4k0pox.mongodb.net/hpdb?retryWrites=true&w=majority&appName=hp";

const PORT = Number(process.env.PORT ?? 3001);

(async () => {
  await mongoose.connect(MONGODB_URI);
  console.log("Mongo connected");

  startScheduler();

  // także przy starcie: serwer na Render bywa restartowany częściej niż raz na dobę
  void cleanPanelDetails();
  setInterval(() => void cleanPanelDetails(), PANEL_CLEANUP_INTERVAL_MS);

  await prepareMeteoData()
  

  setInterval(()=> (async() => {
    await prepareMeteoData()
  })(), 10 * 60 * 1000 );
  
  server.listen(PORT, () => console.log(`Listening on http://localhost:${PORT}`));
})();


