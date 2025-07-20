import 'dotenv/config';
import http from 'http';
import app from './middleware/app'
import { createWsServer } from './middleware/webSocet';

const server = http.createServer(app);
createWsServer(server);

const port = process.env.PORT || 3001;
server.listen(port, () => {
  console.log(`${port}`)
})