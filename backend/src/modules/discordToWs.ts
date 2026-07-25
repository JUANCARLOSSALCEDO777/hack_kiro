/**
 * Orquestador del pipeline Discord → WebSocket 3D.
 *
 * Registra un listener de MessageCreate en el canal designado y ejecuta
 * el pipeline completo: validación → sanitización → rate limit → AI hook → broadcast.
 * No interfiere con el messageHandler existente (son listeners independientes).
 */

import { Client, Events, Guild, Message, TextChannel } from 'discord.js';
import { sanitize, SanitizerConfig } from './sanitizer';
import { WsSender, MessagePayload } from './wsSender';
import { ProfanityFilter } from './ProfanityFilter';
import { DiscordToWsOptions } from '../models/DiscordToWsOptions';
import { RegexFilter } from './RegexFilter';
import { config } from '../../config';
import { logWriter } from './logWriter';

/**
 * Interfaz genérica de sender — permite intercambiar entre WsSender (AWS)
 * y LocalWsSender (desarrollo) sin cambiar el pipeline.
 */
export interface BroadcastSender {
  broadcast(payload: MessagePayload): Promise<void>;
}

/**
 * Inicia el pipeline Discord → WS registrando un listener adicional en el Client.
 * Cada mensaje pasa por validación, sanitización y filtros de palabras seguras.
 */
export function discordToWs(options: DiscordToWsOptions): void {
  const {
    client,
    wsApiEndpoint,
    channelId,
    supportedChars,
    maxMessageLength,
    sender,
  } = options;

  // Si se inyecta un sender externo (LocalWsSender en DEV), usarlo.
  // Si no, crear el WsSender de producción (API Gateway Management API).
  const wsSender: BroadcastSender = sender ?? new WsSender({ apiEndpoint: wsApiEndpoint });

  const prefix = "!";

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

      if( message.content.startsWith(prefix) ) return;

      // 4. Sanitizar el contenido
      const sanitized = sanitize(message.content, sanitizerConfig);

      // 5. Descartar si el texto queda vacío post-sanitización
      if (!sanitized) return;

      const isToxic = ProfanityFilter.hasProfanity(sanitized) || RegexFilter.hasProfanity(sanitized);

      if( isToxic ) {
        logWriter({
          text : `Bloqueado por: ${sanitized}`,
          context : discordToWs.name
        });
        return;
      }

      // 8. Construir el payload y transmitir
      const payload: MessagePayload = {
        type: 'message',
        text: sanitized,
        username: message.author.displayName,
        timestamp: Date.now(),
      };

      wsSender.broadcast(payload);
    } catch (error) {
      // Resiliencia: un error individual no detiene el pipeline (Req 10.1)
      logWriter({
        text : `[discordToWs] Error procesando mensaje: ${error}`,
        context : discordToWs.name
      });
    }
  });

  client.on( Events.GuildCreate, ( guild : Guild ) => {

    if( !( guild.id in config.permitedChannels) ) return;
    logWriter({
      text : `Bot agregado del server: ${guild.name} (${guild.id})`,
      context : discordToWs.name
    });
    const payload: MessagePayload = {
      type: 'message',
      text: 'CODIGOFACILITO',
      username: 'kirito',
      timestamp: Date.now(),
    };
    wsSender.broadcast(payload);
  });

  client.on( Events.GuildDelete, ( guild : Guild ) => {
    logWriter({
      text : `Bot eliminado del server: ${guild.name} (${guild.id})`,
      context : discordToWs.name
    });
    const payload: MessagePayload = {
      type: 'message',
      text: 'NOCODIGOFACILITO',
      username: 'kirito',
      timestamp: Date.now(),
    };
    wsSender.broadcast(payload);
  });

  console.log(`[discordToWs] Pipeline activo — escuchando canal ${channelId}`);
}
