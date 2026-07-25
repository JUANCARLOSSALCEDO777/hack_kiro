import dotenv from 'dotenv';
import { Config } from './src/models/Config';
dotenv.config();

const {

  enviroment,
  serverMONIT,
  channelMONIT,

  clientIDDEV,
  tokenDEV,
  serverIDDEV,

  clientIDPROD,
  tokenPROD,
  serverIDPROD,

  // Variables del pipeline Discord → WebSocket 3D
  WS_API_ENDPOINT,
  WS_CHANNEL_ID,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS,
  MAX_MESSAGE_LENGTH

} = process.env;

// Validación de variables requeridas para el pipeline WS al arranque
const requiredWsVars: Record<string, string | undefined> = {
  WS_API_ENDPOINT,
  WS_CHANNEL_ID
};

for (const [name, value] of Object.entries(requiredWsVars)) {
  if (!value) {
    throw new Error(
      `[config] Variable de entorno requerida "${name}" no está definida. ` +
      `Asegúrate de configurarla en el archivo .env o en el entorno del sistema.`
    );
  }
}

const configPROD : Config = {
  enviroment : enviroment!,
  serverMONIT : serverMONIT!,
  channelMONIT : channelMONIT!,
  clientID : clientIDPROD!,
  token : tokenPROD!,
  serverID : serverIDPROD!,
  wsApiEndpoint : WS_API_ENDPOINT!,
  wsChannelId : WS_CHANNEL_ID!,
  rateLimitMax : Number(RATE_LIMIT_MAX) || 20,
  rateLimitWindowMs : Number(RATE_LIMIT_WINDOW_MS) || 60000,
  maxMessageLength : Number(MAX_MESSAGE_LENGTH) || 50,
  permitedChannels : [serverIDDEV!, serverIDPROD!]
};

const configDESA : Config = {
  enviroment : enviroment!,
  serverMONIT : serverMONIT!,
  channelMONIT : channelMONIT!,
  clientID : clientIDDEV!,
  token : tokenDEV!,
  serverID : serverIDDEV!,
  wsApiEndpoint : WS_API_ENDPOINT!,
  wsChannelId : WS_CHANNEL_ID!,
  rateLimitMax : Number(RATE_LIMIT_MAX) || 20,
  rateLimitWindowMs : Number(RATE_LIMIT_WINDOW_MS) || 60000,
  maxMessageLength : Number(MAX_MESSAGE_LENGTH) || 50,
  permitedChannels : [serverIDDEV!, serverIDPROD!]
};

let config = enviroment === 'PROD' ? configPROD : configDESA;

export { config };