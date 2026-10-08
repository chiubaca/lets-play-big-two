import { initDatabase } from "@big-two/data-ops/database";
import { BigTwoRoomObject } from "./do/big-two-room-do";
import { RoomChatObject } from "./do/room-chat-do";
import { WorkerEntrypoint } from "cloudflare:workers";
import { App } from "./hono/app";
import { sweepRooms } from "./lib/room-expiry";
import { repairTurnAlarms } from "./lib/turn-alarm-repair";
import { checkExpoTurnReceipts } from "./lib/expo-turn-push";

export { BigTwoRoomObject, RoomChatObject };

export default class BigTwoBackend extends WorkerEntrypoint<Env> {
  constructor(ctx: ExecutionContext, env: Env) {
    super(ctx, env);
    initDatabase(env.BIG_TWO_DB);
  }

  fetch(request: Request) {
    return App.fetch(request, this.env, this.ctx);
  }

  async scheduled() {
    try {
      await sweepRooms(this.env);
    } finally {
      try {
        await repairTurnAlarms(this.env);
      } finally {
        await checkExpoTurnReceipts(this.env);
      }
    }
  }
}
