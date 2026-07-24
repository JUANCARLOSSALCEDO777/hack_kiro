/**
 * WsSender — Broadcast de mensajes vía API Gateway WebSocket.
 *
 * El bot se conecta como cliente WebSocket al API Gateway y envía
 * mensajes con action 'sendMessage'. El Lambda se encarga de hacer
 * broadcast a todos los clientes frontend conectados.
 *
 * Este enfoque evita el problema de HTTP 426 — API Gateway WebSocket
 * solo acepta mensajes vía la conexión WebSocket, no vía HTTP directo.
 */

import WebSocket from 'ws';

export interface MessagePayload {
  type: 'message';
  text: string;
  username: string;
  timestamp: number;
}

export interface WsSenderConfig {
  apiEndpoint: string; // wss://{api-id}.execute-api.{region}.amazonaws.com/{stage}
}

export class WsSender {
  private ws: WebSocket | null = null;
  private readonly endpoint: string;
  private reconnecting = false;

  constructor(config: WsSenderConfig) {
    // Asegurar que el endpoint use wss://
    this.endpoint = config.apiEndpoint.replace('https://', 'wss://');
    this.connect();
  }

  /**
   * Envía el payload al API Gateway vía WebSocket.
   * El Lambda se encarga de hacer broadcast a todos los frontends.
   */
  async broadcast(payload: MessagePayload): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[WsSender] WebSocket no conectado, mensaje descartado');
      return;
    }

    const message = JSON.stringify({
      action: 'sendMessage',
      ...payload,
    });

    try {
      this.ws.send(message);
      console.log(`[WsSender] Mensaje enviado: "${payload.text}"`);
    } catch (error) {
      console.error('[WsSender] Error enviando mensaje:', error);
    }
  }

  /** Establece la conexión WebSocket con el API Gateway */
  private connect(): void {
    try {
      this.ws = new WebSocket(this.endpoint);
    } catch (error) {
      console.error('[WsSender] Error creando WebSocket:', error);
      this.scheduleReconnect();
      return;
    }

    this.ws.on('open', () => {
      console.log(`[WsSender] Conectado a API Gateway: ${this.endpoint}`);
      this.reconnecting = false;
    });

    this.ws.on('close', () => {
      console.warn('[WsSender] Conexión cerrada con API Gateway');
      this.scheduleReconnect();
    });

    this.ws.on('error', (error) => {
      console.error('[WsSender] Error en WebSocket:', error.message);
    });
  }

  /** Reconexión con delay fijo de 5s — suficiente para un hackathon */
  private scheduleReconnect(): void {
    if (this.reconnecting) return;
    this.reconnecting = true;

    setTimeout(() => {
      console.log('[WsSender] Reconectando a API Gateway...');
      this.connect();
    }, 5000);
  }
}
