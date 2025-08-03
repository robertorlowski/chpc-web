import WebSocket, { WebSocketServer } from 'ws';

let espClients: Set<WebSocket> = new Set();

export const createWsServer = (server: any) => {
  const wss = new WebSocketServer({ server });    
  
  console.log("server create");

  wss.on('connection', (ws: WebSocket, req) => {s
    const ip = req.socket.remoteAddress;
    console.log(`New client connected: ${ip}`);
    espClients.add(ws);

    ws.on('message', (message) => {
      console.log(`Received from client [${ip}]:`, message.toString());
    });

    ws.on('close', () => {
      console.log(`Client disconnected: ${ip}`);
      espClients.delete(ws);
    });
  });

}

export const sendMessage = (message: String) => {
 if (!message) {
    return;
  }
  setTimeout(() => {
    espClients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }, 3000);
}
