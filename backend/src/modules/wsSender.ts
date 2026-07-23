/**
 * WsSender — Broadcast de mensajes vía API Gateway Management API.
 *
 * El bot en EC2 obtiene los connection IDs activos invocando la ruta
 * getConnections del Lambda, y luego envía el payload a cada uno
 * directamente por la Management API (@connections).
 *
 * Si un connectionId está stale (410 Gone), se ignora sin romper el broadcast.
 * Ante errores de red se reintenta una vez antes de continuar.
 */

import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
  GoneException,
} from '@aws-sdk/client-apigatewaymanagementapi';

export interface MessagePayload {
  type: 'message';
  text: string;
  username: string;
  timestamp: number;
}

export interface WsSenderConfig {
  apiEndpoint: string; // https://{api-id}.execute-api.{region}.amazonaws.com/{stage}
}

export class WsSender {
  private readonly client: ApiGatewayManagementApiClient;
  private readonly apiEndpoint: string;

  constructor(config: WsSenderConfig) {
    this.apiEndpoint = config.apiEndpoint;

    // El endpoint de la Management API es el mismo del stage del API Gateway
    this.client = new ApiGatewayManagementApiClient({
      endpoint: config.apiEndpoint,
    });
  }

  /**
   * Envía el payload a todos los clientes WebSocket conectados.
   * Obtiene los IDs activos del Lambda y postea a cada uno.
   */
  async broadcast(payload: MessagePayload): Promise<void> {
    let connectionIds: string[];

    try {
      connectionIds = await this.getConnectionIds();
    } catch (error) {
      console.error('[WsSender] Error obteniendo connection IDs:', error);
      return;
    }

    if (connectionIds.length === 0) {
      console.log('[WsSender] Sin conexiones activas, broadcast omitido');
      return;
    }

    const data = Buffer.from(JSON.stringify(payload));

    // Enviar a todas las conexiones en paralelo sin que un fallo individual detenga el resto
    const results = await Promise.allSettled(
      connectionIds.map((connectionId) =>
        this.sendToConnection(connectionId, data)
      )
    );

    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) {
      console.warn(`[WsSender] ${failed}/${connectionIds.length} envíos fallaron`);
    }
  }

  /**
   * Obtiene los connection IDs activos invocando la ruta getConnections
   * del API Gateway WebSocket (Lambda responde con la lista de IDs).
   */
  private async getConnectionIds(): Promise<string[]> {
    // La ruta getConnections es un endpoint HTTP(S) expuesto por el API Gateway
    // que retorna un JSON con los IDs de las conexiones activas
    const url = `${this.apiEndpoint.replace('wss://', 'https://')}/getConnections`;

    const response = await this.fetchWithRetry(url);
    const body = await response.json() as { connectionIds?: string[] };

    return body.connectionIds ?? [];
  }

  /**
   * Envía datos a un connectionId específico vía la Management API.
   * Si el connection ID está stale (410 Gone), lo ignora silenciosamente.
   */
  private async sendToConnection(connectionId: string, data: Buffer): Promise<void> {
    const command = new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: data,
    });

    try {
      await this.client.send(command);
    } catch (error: unknown) {
      // 410 Gone = la conexión ya no existe, ignorar sin romper el broadcast
      if (error instanceof GoneException) {
        console.log(`[WsSender] Connection ${connectionId} stale (410 Gone), ignorada`);
        return;
      }

      // Para otros errores, reintentar una vez
      console.warn(`[WsSender] Error enviando a ${connectionId}, reintentando...`);
      try {
        await this.client.send(command);
      } catch (retryError) {
        console.error(`[WsSender] Reintento fallido para ${connectionId}:`, retryError);
      }
    }
  }

  /**
   * Fetch con un reintento ante errores de red.
   * Si el primer intento falla, espera brevemente y reintenta.
   */
  private async fetchWithRetry(url: string): Promise<Response> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response;
    } catch (error) {
      console.warn('[WsSender] Error en fetch, reintentando una vez...', error);
      // Espera breve antes de reintentar (evita hammering inmediato)
      await new Promise((resolve) => setTimeout(resolve, 500));

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} en reintento: ${response.statusText}`);
      }
      return response;
    }
  }
}
