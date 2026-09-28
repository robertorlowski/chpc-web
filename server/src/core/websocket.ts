// WebSocket na tym samym porcie co HTTP (ścieżka dowolna, w praktyce /ws?rootId=…).
// Łączą się sterownik co i przeglądarki. Serwer tylko powiadamia: "operation"
// (setOperationAction) budzi co, żeby od razu wysłał /hp/add; "update" (addHpData)
// każe klientowi odświeżyć dane. Treść wiadomości przychodzących jest tylko logowana.
import WebSocket, { WebSocketServer } from 'ws';

// połączenie -> rootId; sterownik i przeglądarki tego samego urządzenia są
// nierozróżnialne, więc każdy komunikat trafia do wszystkich
const espClients = new Map<WebSocket, string>();

export const createWsServer = (server: any) => {
  const wss = new WebSocketServer({ server });    
  
  console.log("server create");

  wss.on('connection', async (ws: WebSocket, req) => {
    const ip = req.socket.remoteAddress;
    console.log(`New client connected: ${ip}`);
    const queryRootId = new URL(req.url ?? '/', 'http://localhost').searchParams.get('rootId');
    // bez rootId nie wiadomo, do którego sterownika kierować komunikaty
    if (!queryRootId) {
      ws.close(1008, 'rootId jest wymagane');
      return;
    }
    const rootId = queryRootId;
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

// Wysyła {type: message, rootId} do połączeń danego urządzenia z opóźnieniem 1 s,
// czyli już po zakończeniu bieżącego żądania (zapis w bazie, odpowiedź HTTP).
// Nie czeka na dostarczenie i nie kolejkuje: niepołączony odbiorca go nie dostanie.
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
