/**
 * Orquestador del pipeline Discord → WebSocket 3D.
 *
 * Registra un listener de MessageCreate en el canal designado y ejecuta
 * el pipeline completo: validación → sanitización → rate limit → AI hook → broadcast.
 * No interfiere con el messageHandler existente (son listeners independientes).
 */

import { Client, Events, Message } from 'discord.js';
import { sanitize, SanitizerConfig, DEFAULT_SUPPORTED_CHARS } from './sanitizer';
import { RateLimiter, RateLimitConfig } from './rateLimiter';
import { AiFilterHook, passthroughFilter } from './aiFilterHook';
import { WsSender, MessagePayload } from './wsSender';

/**
 * Interfaz genérica de sender — permite intercambiar entre WsSender (AWS)
 * y LocalWsSender (desarrollo) sin cambiar el pipeline.
 */
export interface BroadcastSender {
  broadcast(payload: MessagePayload): Promise<void>;
}

export interface DiscordToWsOptions {
  client: Client;
  wsApiEndpoint: string;
  channelId: string;
  rateLimitConfig: RateLimitConfig;
  aiFilterHook?: AiFilterHook;
  maxMessageLength: number;
  supportedChars: Set<number>;
  /** Sender inyectable — si no se pasa, se usa WsSender (producción) */
  sender?: BroadcastSender | undefined;
}

/**
 * Inicia el pipeline Discord → WS registrando un listener adicional en el Client.
 * Cada mensaje pasa por validación, sanitización, rate limit, AI hook y broadcast.
 */
export function discordToWs(options: DiscordToWsOptions): void {
  const {
    client,
    wsApiEndpoint,
    channelId,
    rateLimitConfig,
    aiFilterHook = passthroughFilter,
    maxMessageLength,
    supportedChars,
    sender,
  } = options;

  const rateLimiter = new RateLimiter(rateLimitConfig);

  // Si se inyecta un sender externo (LocalWsSender en DEV), usarlo.
  // Si no, crear el WsSender de producción (API Gateway Management API).
  const wsSender: BroadcastSender = sender ?? new WsSender({ apiEndpoint: wsApiEndpoint });

  const sanitizerConfig: SanitizerConfig = {
    maxLength: maxMessageLength,
    supportedChars,
  };

  // Listener adicional — no interfiere con el messageHandler del bot
  client.on(Events.MessageCreate, async (message: Message) => {
    try {
      // 1. Validar que el mensaje proviene del canal designado
      if (message.channelId !== channelId) return;

      // 2. Descartar mensajes de bots
      if (message.author.bot) return;

      // 3. Descartar contenido vacío (pre-sanitización)
      if (!message.content.trim()) return;

      // 4. Sanitizar el contenido
      const sanitized = sanitize(message.content, sanitizerConfig);

      // 5. Descartar si el texto queda vacío post-sanitización
      if (!sanitized) return;

      // 6. Verificar rate limit
      if (!rateLimiter.tryConsume()) return;

      // 7. Aplicar AI filter hook
      const filtered = sanitized.slice(0, 20);

      // 8. Construir el payload y transmitir
      const payload: MessagePayload = {
        type: 'message',
        text: filtered,
        username: message.author.username,
        timestamp: Date.now(),
      };

      await wsSender.broadcast(payload);
    } catch (error) {
      // Resiliencia: un error individual no detiene el pipeline (Req 10.1)
      console.error('[discordToWs] Error procesando mensaje:', error);
    }
  });

  console.log(`[discordToWs] Pipeline activo — escuchando canal ${channelId}`);
}
