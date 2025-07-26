import { WebSocketServer } from 'ws';
import net from 'net';
import { parseStringPromise } from 'xml2js';

const MUD_HOST = 'localhost'; // TODO: Set your MUD server host
const MUD_PORT = 4000;        // TODO: Set your MUD server port
const WS_PORT = 8080;

const wss = new WebSocketServer({ port: WS_PORT });

wss.on('connection', (ws: import('ws').WebSocket) => {
  // Connect to the MUD server for each client
  const mudSocket = net.createConnection({ host: MUD_HOST, port: MUD_PORT }, () => {
    console.log('Connected to MUD server');
  });

  mudSocket.on('data', async (data) => {
    const xml = data.toString();
    try {
      const json = await parseStringPromise(xml);
      ws.send(JSON.stringify({ type: 'mud', data: json }));
    } catch (err) {
      ws.send(JSON.stringify({ type: 'error', error: 'Invalid XML from MUD', raw: xml }));
    }
  });

  mudSocket.on('end', () => {
    ws.send(JSON.stringify({ type: 'info', message: 'Disconnected from MUD server' }));
    ws.close();
  });

  mudSocket.on('error', (err) => {
    ws.send(JSON.stringify({ type: 'error', error: err.message }));
    ws.close();
  });

  ws.on('message', (message: string | Buffer) => {
    // Forward client message to MUD
    mudSocket.write(message.toString() + '\n');
  });

  ws.on('close', () => {
    mudSocket.end();
  });
});

console.log(`WebSocket server running on ws://localhost:${WS_PORT}`); 