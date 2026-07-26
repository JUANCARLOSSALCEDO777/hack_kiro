import { MessagePayload } from "discord.js";

interface BroadcastSender {
  broadcast(payload: MessagePayload): Promise<void>;
}

export type { BroadcastSender };