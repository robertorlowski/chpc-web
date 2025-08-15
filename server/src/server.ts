import 'dotenv/config';
import http from 'http';
import app from './middleware/app'
import { createWsServer } from './middleware/webSocet';
import mongoose from 'mongoose';

const server = http.createServer(app);
createWsServer(server);

const MONGODB_URI =  process.env.MONGODB_URI ?? "mongodb+srv://hp:QzzlrWEruB3ZbE2S@hp.e4k0pox.mongodb.net/hpdb?retryWrites=true&w=majority&appName=hp";

const PORT = Number(process.env.PORT ?? 3001);

(async () => {
  await mongoose.connect(MONGODB_URI);
  console.log("Mongo connected");
  server.listen(PORT, () => console.log(`Listening on http://localhost:${PORT}`));
})();


