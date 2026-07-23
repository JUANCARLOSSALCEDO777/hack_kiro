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
  serverIDPROD

} = process.env;

const configPROD : Config = {
  enviroment : enviroment!,
  serverMONIT : serverMONIT!,
  channelMONIT : channelMONIT!,
  clientID : clientIDPROD!,
  token : tokenPROD!,
  serverID : serverIDPROD!
};

const configDESA : Config = {
  enviroment : enviroment!,
  serverMONIT : serverMONIT!,
  channelMONIT : channelMONIT!,
  clientID : clientIDDEV!,
  token : tokenDEV!,
  serverID : serverIDDEV!
};

let config = enviroment === 'PROD' ? configPROD : configDESA;

export { config };