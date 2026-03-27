import { initDatabase } from "@big-two/data-ops/database";
import { BigTwoRoomObject } from "./do/big-two-room-do";
import { WorkerEntrypoint } from "cloudflare:workers";
import { App } from "./hono/app";

export { BigTwoRoomObject };

export default class BigTwoBackend extends WorkerEntrypoint<Env> {
  constructor(ctx: ExecutionContext, env: Env) {
    super(ctx, env);
    initDatabase(env.BIG_TWO_DB);
  }

  fetch(request: Request) {
    return App.fetch(request, this.env, this.ctx);
  }
}
