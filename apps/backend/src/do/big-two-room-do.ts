import { createActor } from "xstate";
import { DurableObject } from "cloudflare:workers";

import {
  type GameEvent,
  bigTwoGameMachine,
  type BigTwoGameMachineSnapshot,
  type Player,
} from "@big-two/game-state-machine";

export class BigTwoRoomObject extends DurableObject<Env> {
  sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;

    this.sql.exec(`
			CREATE TABLE IF NOT EXISTS game_room(
				id INTEGER PRIMARY KEY,
				game_state TEXT
			);
		`);
  }

  async gameAction(event: GameEvent) {
    const query = this.sql.exec(`SELECT game_state FROM game_room WHERE id = 1`);

    const record = query.one();
    if (!record) {
      throw new Error("No game state found");
    }

    const gameState = JSON.parse(record.game_state as string) as BigTwoGameMachineSnapshot;

    const gameStateMachineActor = createActor(bigTwoGameMachine, {
      snapshot: gameState,
    }).start();

    gameStateMachineActor.send(event);

    const gameStateSnapshot =
      gameStateMachineActor.getPersistedSnapshot() as BigTwoGameMachineSnapshot;

    const serialisedGameState = JSON.stringify(gameStateSnapshot);
    this.sql.exec(`UPDATE game_room SET game_state = ? WHERE id = 1`, serialisedGameState);

    const sockets = this.ctx.getWebSockets();
    for (const socket of sockets) {
      socket.send(serialisedGameState);
    }
  }

  async getGameState() {
    const query = this.sql.exec(`SELECT game_state FROM game_room WHERE id = 1`);

    const record = query.one();
    if (!record) {
      return null;
    }

    return record.game_state as string;
  }

  async createRoom(player: Pick<Player, "id" | "name">) {
    const machine = createActor(bigTwoGameMachine).start();
    machine.send({
      type: "JOIN_GAME",
      playerId: player.id,
      playerName: player.name,
    });
    const gameState = machine.getPersistedSnapshot();

    this.sql.exec(
      `INSERT OR REPLACE INTO game_room (id, game_state) VALUES (?, ?)`,
      1,
      JSON.stringify(gameState),
    );
  }

  async fetch(_: Request) {
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);
    this.ctx.acceptWebSocket(server);
    console.log("connected");

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  webSocketClose(
    _ws: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean,
  ): void | Promise<void> {
    console.log("client closed");
  }
}
