/**
 * dev-ws-server.ts — Servidor WebSocket standalone para desarrollo.
 *
 * Levanta un WS server local en el puerto 4200 y envía mensajes de prueba
 * periódicamente para simular el flujo sin necesidad del bot de Discord.
 *
 * Uso: npx tsx dev-ws-server.ts
 *
 * El frontend (en localhost) se conectará automáticamente a ws://localhost:4200
 * gracias a la detección de hostname en Config.js.
 */

import { WebSocketServer, WebSocket } from 'ws';

const PORT = 4200;
const wss = new WebSocketServer({ port: PORT });

console.log(`[dev-ws-server] Servidor WebSocket local activo en ws://localhost:${PORT}`);
console.log('[dev-ws-server] Esperando conexiones del frontend...');
console.log('[dev-ws-server] Escribe mensajes en la consola para enviarlos al frontend.');
console.log('[dev-ws-server] (También envía mensajes de prueba cada 10 segundos)\n');

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  console.log(`[+] Cliente conectado desde ${ip} (total: ${wss.clients.size})`);

  ws.on('close', () => {
    console.log(`[-] Cliente desconectado (total: ${wss.clients.size})`);
  });
});

/** Envía un payload a todos los clientes conectados */
function broadcast(text: string, username: string = 'DevUser') {
  const payload = JSON.stringify({
    type: 'message',
    text: text.toUpperCase(),
    username,
    timestamp: Date.now(),
  });

  let sent = 0;
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
      sent++;
    }
  }

  console.log(`[broadcast] "${text.toUpperCase()}" → ${sent} cliente(s)`);
}

// Mensajes de prueba automáticos cada 10 segundos
const testMessages = [
  'HOLA MUNDO',
  'TESTING 123',
  'DISCORD 3D',
  'PIXEL TEXT',
  'KIRO HACK',
  'HELLO WORLD',
];

let msgIndex = 0;
setInterval(() => {
  if (wss.clients.size > 0) {
    const msg = testMessages[msgIndex % testMessages.length]!;
    broadcast(msg, 'TestBot');
    msgIndex++;
  }
}, 10000);

// Leer mensajes desde stdin para envío manual
process.stdin.setEncoding('utf8');
process.stdin.on('data', (data: string) => {
  const text = data.trim();
  if (text) {
    broadcast(text, 'ConsoleUser');
  }
});
