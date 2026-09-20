import WebSocket, { WebSocketServer } from 'ws';
import { getDefaultDeviceRootId } from '../services/device.service';

const espClients = new Map<WebSocket, string>();

export const createWsServer = (server: any) => {
  const wss = new WebSocketServer({ server });    
  
  console.log("server create");

  wss.on('connection', async (ws: WebSocket, req) => {
    const ip = req.socket.remoteAddress;
    console.log(`New client connected: ${ip}`);
    const queryRootId = new URL(req.url ?? '/', 'http://localhost').searchParams.get('rootId');
    const rootId = queryRootId || await getDefaultDeviceRootId();
    espClients.set(ws, rootId);
    console.log(`WebSocket registered for device: ${rootId}`);

    ws.on('message', (message) => {
      console.log(`Received from client [${ip}]:`, message.toString());
    });

    ws.on('close', () => {
      console.log(`Client disconnected: ${ip}`);
      espClients.delete(ws);
    });
  });

}

export const sendMessage = async (message: String, rootId: string) => {
 if (!message) {
    return;
  }
  const payload = JSON.stringify({ type: String(message), rootId });
  setTimeout(() => {
    espClients.forEach((clientRootId, client) => {
      if (clientRootId === rootId && client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  }, 1000);
}
