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
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildIntegrations
  ],
  partials: [ Partials.Channel ]
});

client.once(Events.ClientReady, ( event : Client<boolean> ) => {

  client.user?.setActivity("gente maravillosa", { type: 3 } ); // 3 = Watching

  messageHandler( { client : client } );

  // Pipeline Discord → WebSocket 3D: reenvía mensajes del canal designado a la experiencia 3D
  discordToWs({
    client,
    wsApiEndpoint: config.wsApiEndpoint,
    channelId: config.wsChannelId,
    maxMessageLength: config.maxMessageLength,
    supportedChars: DEFAULT_SUPPORTED_CHARS,
    sender: undefined,
  });

  console.log(`Listo! Loggeado como ${ event.user?.tag } en ambiente ${ config.enviroment }`);

});

client.login(config.token);