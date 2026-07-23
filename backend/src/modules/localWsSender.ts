/**
 * LocalWsSender — Broadcast directo por WebSocket para desarrollo local.
 *
 * En vez de usar API Gateway Management API (que requiere infra AWS desplegada),
 * este sender levanta un servidor WebSocket local y envía directamente a los
 * clientes conectados. Implementa la misma interfaz que WsSender.
 */

import { WebSocketServer, WebSocket } from 'ws';
import { MessagePayload } from './wsSender';

export interface LocalWsSenderConfig {
  port: number; // Puerto donde se levanta el WS server local
}

export class LocalWsSender {
  private readonly wss: WebSocketServer;
  private readonly port: number;

  constructor(config: LocalWsSenderConfig) {
    this.port = config.port;

    // Levantar el server WS en el puerto configurado
    this.wss = new WebSocketServer({ port: config.port });

    this.wss.on('listening', () => {
      console.log(`[LocalWsSender] Server WS local activo en ws://localhost:${this.port}`);
    });

    this.wss.on('connection', (ws, req) => {
      const ip = req.socket.remoteAddress;
      console.log(`[LocalWsSender] Cliente conectado desde ${ip} (total: ${this.wss.clients.size})`);

      ws.on('close', () => {
        console.log(`[LocalWsSender] Cliente desconectado (total: ${this.wss.clients.size})`);
      });
    });
  }

  /**
   * Envía el payload a todos los clientes WebSocket conectados localmente.
   * Misma firma que WsSender.broadcast() para ser intercambiable.
   */
  async broadcast(payload: MessagePayload): Promise<void> {
    const data = JSON.stringify(payload);
    let sent = 0;

    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
        sent++;
      }
    }

    if (sent > 0) {
      console.log(`[LocalWsSender] Broadcast a ${sent} cliente(s): "${payload.text}"`);
    } else {
      console.log('[LocalWsSender] Sin clientes conectados, broadcast omitido');
    }
  }

  /** Cierra el servidor WS */
  close(): void {
    this.wss.close();
  }
}
