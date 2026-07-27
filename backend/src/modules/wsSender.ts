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
import { logWriter } from './logWriter';

export interface MessagePayload {
  type: 'message' | 'PING';
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
  private reconnectTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pongReceived = false;

  /** Intervalo de reconexión forzada: 7 min (en ms) */
  private static readonly FORCED_RECONNECT_MS = 30 * 60 * 1000;

  /** Intervalo de heartbeat ping: cada 30 segundos */
  private static readonly HEARTBEAT_MS = 30 * 1000;

  /** Timeout para considerar la conexión muerta si no llega pong */
  private static readonly PONG_TIMEOUT_MS = 10 * 1000;

  constructor(config: WsSenderConfig) {
    // Asegurar que el endpoint use wss://
    this.endpoint = config.apiEndpoint.replace('https://', 'wss://');
    this.connect();
    this.startReconnectCron();
  }

  /**
   * Inicia un "cron" que fuerza reconexión cada 1.5 horas.
   * Esto previene que API Gateway cierre la conexión idle
   * y mantiene el WebSocket fresco.
   */
  private startReconnectCron(): void {
    this.reconnectTimer = setInterval(() => {
      logWriter({
        text: 'Reconexión programada (xh) — cerrando conexión actual...',
        context: WsSender.name
      });
      this.forceReconnect();
    }, WsSender.FORCED_RECONNECT_MS);
  }

  /**
   * Cierra la conexión actual y reconecta inmediatamente.
   */
  private forceReconnect(): void {
    this.stopHeartbeat();
    if (this.ws) {
      // Eliminar listeners para evitar que el 'close' dispare scheduleReconnect
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
    this.reconnecting = false;
    this.connect();
  }

  /**
   * Envía el payload al API Gateway vía WebSocket.
   * El Lambda se encarga de hacer broadcast a todos los frontends.
   */
  async broadcast(payload: MessagePayload): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logWriter({
        text : 'WebSocket no conectado, mensaje descartado',
        context : WsSender.name
      });
      return;
    }

    const message = JSON.stringify({
      action: 'sendMessage',
      ...payload,
    });

    try {
      this.ws.send(message);
      logWriter({
        text : `Mensaje enviado: "${payload.text}"`,
        context : WsSender.name,
        user: payload.username
      });
    } catch (error) {
      console.error('Error enviando mensaje:', error);
      logWriter({
        text : `Error enviando mensaje: "${error}"`,
        context : WsSender.name
      });
    }
  }

  /** Establece la conexión WebSocket con el API Gateway */
  private connect(): void {
    try {
      this.ws = new WebSocket(this.endpoint);
    } catch (error) {
      logWriter({
        text : `Error creando WebSocket: "${error}"`,
        context : WsSender.name
      });
      this.scheduleReconnect();
      return;
    }

    this.ws.on('open', () => {
      logWriter({
        text : `Conectado a API Gateway: ${this.endpoint}`,
        context : WsSender.name
      });
      this.reconnecting = false;
      this.startHeartbeat();
    });

    this.ws.on('pong', () => {
      this.pongReceived = true;
    });

    this.ws.on('close', () => {
      logWriter({
        text : 'Conexión cerrada con API Gateway',
        context : WsSender.name
      });
      this.stopHeartbeat();
      this.scheduleReconnect();
    });

    this.ws.on('error', (error) => {
      logWriter({
        text : `Error en WebSocket:: ${error.message}`,
        context : WsSender.name
      });
    });
  }

  /**
   * Inicia el heartbeat: envía ping cada 30s y verifica que llegue pong.
   * Si no llega pong en 10s, la conexión se considera muerta y se reconecta.
   */
  private startHeartbeat(): void {
    this.stopHeartbeat(); // Limpiar si ya existía
    this.heartbeatTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

      this.pongReceived = false;
      this.ws.ping();

      // Si en PONG_TIMEOUT_MS no llega pong, forzar reconexión
      setTimeout(() => {
        if (!this.pongReceived && this.ws) {
          logWriter({
            text: 'Heartbeat fallido (sin pong) — forzando reconexión',
            context: WsSender.name
          });
          this.forceReconnect();
        }
      }, WsSender.PONG_TIMEOUT_MS);
    }, WsSender.HEARTBEAT_MS);
  }

  /** Detiene el heartbeat */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /** Reconexión con delay fijo de 5s — suficiente para un hackathon */
  private scheduleReconnect(): void {
    if (this.reconnecting) return;
    this.reconnecting = true;

    setTimeout(() => {
      logWriter({
        text : 'Reconectando a API Gateway...',
        context : WsSender.name
      });
      this.connect();

    }, 5000);
  }
}
