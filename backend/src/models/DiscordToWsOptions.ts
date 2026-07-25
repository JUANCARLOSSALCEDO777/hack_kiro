import { Client } from "discord.js";
import { BroadcastSender } from "../modules/discordToWs";

interface DiscordToWsOptions {
  client: Client;
  wsApiEndpoint: string;
  channelId: string;
  supportedChars: Set<number>;
  maxMessageLength: number;
  sender?: BroadcastSender | undefined;
}

export type { DiscordToWsOptions };