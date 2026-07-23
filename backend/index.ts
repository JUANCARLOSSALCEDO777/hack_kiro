import {
  Client,
  Events,
  GatewayIntentBits,
  AllowedMentionsTypes,
  ActivityType,
  Partials
} from "discord.js";

import { config } from "./config";
import { messageHandler } from "./src/modules/messageHandler";

const client = new Client({
  allowedMentions : {
    parse: [
      AllowedMentionsTypes.User,
      AllowedMentionsTypes.Role,
      AllowedMentionsTypes.Everyone
    ],
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

  client.user?.setActivity("gente maravillosa", { type: ActivityType.Watching } );

  messageHandler( { client : client } );

  console.log(`Listo! Loggeado como ${ event.user?.tag } en ambiente ${ config.enviroment }`);

});

client.login(config.token);