import 'dotenv/config';
import http from 'http';
import app from './core/app'
import { createWsServer } from './core/websocket';
import mongoose from 'mongoose';
import { prepareMeteoData } from './core/services/meteo.service';
import { startScheduler } from './modules/heat-pump/services/scheduler.service';
import { removeExpiredPanelDetails } from './modules/heat-pump/services/pv.service';

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

// adres z hasłem tylko w zmiennej środowiskowej (Render: Environment, lokalnie server/.env)
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("Brak MONGODB_URI: ustaw zmienną środowiskową albo server/.env (wzór w server/.env.example)");
  process.exit(1);
}

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


