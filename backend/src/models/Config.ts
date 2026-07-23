interface Config {
  enviroment: string;
  serverMONIT: string;
  channelMONIT: string;
  clientID: string;
  token: string;
  serverID: string;

  // Configuración del pipeline Discord → WebSocket
  wsApiEndpoint: string;
  wsChannelId: string;
  rateLimitMax: number;
  rateLimitWindowMs: number;
  maxMessageLength: number;
}

export type { Config };