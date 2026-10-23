import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { tradeStore } from './tradeStore.js';

let wss: WebSocketServer | null = null;
const clients: Set<WebSocket> = new Set();

export function setupWebSocketServer(server: Server) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    clients.add(ws);

    // Send initial snapshot immediately upon connect
    const initialState = tradeStore.getState();
    ws.send(
      JSON.stringify({
        type: 'init',
        payload: initialState,
      })
    );

    ws.on('message', (message: string) => {
      try {
        const data = JSON.parse(message.toString());
        handleClientMessage(ws, data);
      } catch (e) {
        // Ignore malformed client message
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
    });

    ws.on('error', () => {
      clients.delete(ws);
    });
  });

  return wss;
}

export function broadcast(message: { type: string; payload: any }) {
  if (!wss || clients.size === 0) return;
  let raw: string;
  try {
    raw = JSON.stringify(message);
  } catch (err) {
    console.error('broadcast: failed to serialise message', err);
    return;
  }
  for (const client of clients) {
    if (client.readyState !== WebSocket.OPEN) continue;
    try {
      client.send(raw);
    } catch (err) {
      // A throwing client is dead; drop it so it stops poisoning broadcasts.
      console.warn('broadcast: dropping unresponsive client', err);
      clients.delete(client);
      try { client.close(); } catch { /* ignore */ }
    }
  }
}

function handleClientMessage(ws: WebSocket, data: any) {
  if (data.type === 'ping') {
    ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
    return;
  }

  if (data.type === 'get_state') {
    ws.send(JSON.stringify({ type: 'init', payload: tradeStore.getState() }));
    return;
  }
}
