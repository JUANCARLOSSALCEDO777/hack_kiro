import {
  Client,
  Events,
  GatewayIntentBits,
  Partials
} from "discord.js";

import { config } from "./config";
import { messageHandler } from "./src/modules/messageHandler";
import { discordToWs } from "./src/modules/discordToWs";
import { DEFAULT_SUPPORTED_CHARS } from "./src/modules/sanitizer";
import { LocalWsSender } from "./src/modules/localWsSender";

const client = new Client({
  allowedMentions : {
    parse: ['users', 'roles', 'everyone'],
    repliedUser: true
  },
  intents: [
    GatewayIntentBits.MessageContent,

    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildIntegrations,

    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.DirectMessageReactions,
    GatewayIntentBits.DirectMessageTyping,
    GatewayIntentBits.DirectMessagePolls
  ],
  partials: [ Partials.Channel ]
});

client.once(Events.ClientReady, ( event : Client<boolean> ) => {

  client.user?.setActivity("gente maravillosa", { type: 3 } ); // 3 = Watching

  messageHandler( { client : client } );

  // En DEV usar WebSocket local directo; en PROD usar API Gateway Management API
  const localSender = config.enviroment !== 'PROD'
    ? new LocalWsSender({ port: 4200 })
    : undefined;

  // Pipeline Discord → WebSocket 3D: reenvía mensajes del canal designado a la experiencia 3D
  discordToWs({
    client,
    wsApiEndpoint: config.wsApiEndpoint,
    channelId: config.wsChannelId,
    rateLimitConfig: {
      maxTokens: config.rateLimitMax,
      refillRate: config.rateLimitMax / (config.rateLimitWindowMs / 1000),
      windowMs: config.rateLimitWindowMs,
    },
    maxMessageLength: config.maxMessageLength,
    supportedChars: DEFAULT_SUPPORTED_CHARS,
    sender: localSender,
  });

  console.log(`Listo! Loggeado como ${ event.user?.tag } en ambiente ${ config.enviroment }`);

});

client.login(config.token);