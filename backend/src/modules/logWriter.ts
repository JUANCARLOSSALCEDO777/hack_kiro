import { appendFile } from "fs";

const logWriter = ( { text, context = "No context", user = "Kirito" } : { text : string, context:string, user?:string } ) => {

  const log = `\n[ ${new Date().toLocaleString()} => <${context}> - <${user}> ]: ${text}`;

  appendFile('./src/resources/bot.log', log, (error) => {
    if ( error ) {
      console.error('Hubo un error al escribir en el archivo de log: ' + error);
    }
  });

  console.log(log.trim());
}

export { logWriter };
