import { Client, Events, GuildMember, Message, OmitPartialGroupDMChannel, TextChannel, User } from "discord.js";
import { config } from "../../config";

const messageHandler = ( { client } : { client : Client<boolean> } ) => {

  const channelPruebas = client.channels.cache.get( config.channelMONIT ) as TextChannel;

  const prefix = "!";

  client.on( Events.MessageCreate, ( message : OmitPartialGroupDMChannel<Message<boolean>> ) => {

    if( !message.inGuild() ) return;

    if( message.author.bot || message.channel.id != channelPruebas.id ) return;
  
    if( !message.content.startsWith(prefix) ) return;

    const cleanMessage = message.content.replace(prefix,"").toLowerCase().trim();

    switch (cleanMessage) {
      case 'saluda':
        channelPruebas.send(`Hola ${message.author}!`);
        break;
    
      default:
        break;
    }
    
  });

};

export { messageHandler }; 