import { createActor } from "xstate";
import { DurableObject } from "cloudflare:workers";

import {
  type GameEvent,
  bigTwoGameMachine,
  type BigTwoGameMachineSnapshot,
  type Player,
} from "@big-two/game-state-machine";
import { getGameActionAuthorizationError } from "./authorize-game-action";
import { redactPlayerIdentity } from "./redact-player-identity";
import { roomView } from "./room-view";

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

  async gameAction(
    event: GameEvent,
    requesterId: string,
  ): Promise<{ success: true } | { success: false; error: string }> {
    const query = this.sql.exec(`SELECT game_state FROM game_room WHERE id = 1`);

    const record = query.toArray()[0];
    if (!record) {
      throw new Error("No game state found");
    }

    const gameState = JSON.parse(record.game_state as string) as BigTwoGameMachineSnapshot;

    const authorizationError = getGameActionAuthorizationError({
      event,
      players: gameState.context.players,
      requesterId,
    });
    if (authorizationError) {
      return { success: false, error: authorizationError };
    }

    const gameStateMachineActor = createActor(bigTwoGameMachine, {
      snapshot: gameState,
    }).start();

    gameStateMachineActor.send(event);

    const gameStateSnapshot =
      gameStateMachineActor.getPersistedSnapshot() as BigTwoGameMachineSnapshot;
    if (gameStateSnapshot.context.guardMessage) {
      return { success: false, error: gameStateSnapshot.context.guardMessage };
    }
    if (
      event.type === "JOIN_GAME" &&
      !gameStateSnapshot.context.players.some((player) => player.id === requesterId)
    ) {
      return { success: false, error: "This room is no longer accepting players" };
    }
    const serialisedGameState = JSON.stringify(gameStateSnapshot);
    this.sql.exec(`UPDATE game_room SET game_state = ? WHERE id = 1`, serialisedGameState);
    this.broadcast(gameStateSnapshot);

    return { success: true };
  }

  async getGameState() {
    const query = this.sql.exec(`SELECT game_state FROM game_room WHERE id = 1`);

    const record = query.toArray()[0];
    if (!record) {
      return null;
    }

    return record.game_state as string;
  }

  async getRoomView(viewerId: string) {
    const stored = await this.getGameState();
    if (!stored) return null;
    const state = JSON.parse(stored) as BigTwoGameMachineSnapshot;
    return roomView(state, viewerId, this.spectatorCount(state));
  }

  private spectatorCount(state: BigTwoGameMachineSnapshot, excluding?: WebSocket) {
    const playerIds = new Set(state.context.players.map((player) => player.id));
    return new Set(
      this.ctx
        .getWebSockets()
        .filter((socket) => socket !== excluding)
        .map((socket) => socket.deserializeAttachment() as string | null)
        .filter((id): id is string => !!id && !playerIds.has(id)),
    ).size;
  }

  private broadcast(state: BigTwoGameMachineSnapshot, excluding?: WebSocket) {
    const count = this.spectatorCount(state, excluding);
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === excluding) continue;
      const viewerId = socket.deserializeAttachment() as string | null;
      if (viewerId) socket.send(JSON.stringify(roomView(state, viewerId, count)));
    }
  }

  async createRoom(player: Pick<Player, "id" | "name">) {
    const machine = createActor(bigTwoGameMachine).start();
    machine.send({
      type: "JOIN_GAME",
      playerId: player.id,
      playerName: player.name,
    });
    const gameState = machine.getPersistedSnapshot();
    console.log(
      "🔍 ~ createRoom ~ apps/backend/src/do/big-two-room-do.ts:72 ~ gameState:",
      JSON.stringify(gameState, null, 2),
    );

    this.sql.exec(
      `INSERT OR REPLACE INTO game_room (id, game_state) VALUES (?, ?)`,
      1,
      JSON.stringify(gameState),
    );
  }

  redactPlayer(playerId: string) {
    const query = this.sql.exec(`SELECT game_state FROM game_room WHERE id = 1`);
    const record = query.toArray()[0];
    if (!record) return;

    const gameState = JSON.parse(record.game_state as string) as BigTwoGameMachineSnapshot;
    const redactedState = redactPlayerIdentity(
      gameState,
      playerId,
      `deleted-${crypto.randomUUID()}`,
    );
    if (!redactedState) return;

    const serialisedGameState = JSON.stringify(redactedState);
    this.sql.exec(`UPDATE game_room SET game_state = ? WHERE id = 1`, serialisedGameState);

    this.broadcast(redactedState);
  }

  async fetch(request: Request) {
    const viewerId = request.headers.get("X-Room-Viewer-ID");
    const stored = await this.getGameState();
    if (!viewerId || !stored) return new Response("Room not found", { status: 404 });
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);
    server.serializeAttachment(viewerId);
    this.ctx.acceptWebSocket(server);
    this.broadcast(JSON.parse(stored) as BigTwoGameMachineSnapshot);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  webSocketMessage(ws: WebSocket) {
    ws.send(
      JSON.stringify({
        error: "The room WebSocket is read-only; send actions through the HTTP endpoint",
      }),
    );
  }

  webSocketClose(
    ws: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean,
  ): void | Promise<void> {
    const stored = this.sql.exec(`SELECT game_state FROM game_room WHERE id = 1`).toArray()[0];
    if (stored)
      this.broadcast(JSON.parse(stored.game_state as string) as BigTwoGameMachineSnapshot, ws);
  }

  webSocketError(_ws: WebSocket, error: unknown) {
    console.error("WebSocket error:", error);
  }
}
