import { Client, Events, GuildMember, Message, MessageFlags, OmitPartialGroupDMChannel, TextChannel, User } from "discord.js";
import { config } from "../../config";
import { ProfanityFilter } from "./ProfanityFilter";
import { logWriter } from "./logWriter";

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

      case 'recarga':
        ProfanityFilter.loadDictionary();
        channelPruebas.send('Diccionario actualizado...');
        console.log('Diccionario actualizado...');
        break;

      case 'logs':
        try {

          channelPruebas.send({
            content: `Logs completos del discord`,
            files : [ './src/resources/bot.log']
          });

          logWriter({
            text : `Solicito los logs.`,
            context : messageHandler.name,
            user : `${message.author.displayName}(${message.author.username})` || "Usuario no encontrado"
          });

        } catch (error) {
          
        }
    
      default:
        break;
    }
    
  });

};

export { messageHandler }; 