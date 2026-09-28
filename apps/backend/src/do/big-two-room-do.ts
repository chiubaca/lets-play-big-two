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

type RoomVisitor = { roomId: string; userId: string; sessionId: string };
const TWO_DAYS = 48 * 60 * 60 * 1000;
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

export class BigTwoRoomObject extends DurableObject<Env> {
  sql: SqlStorage;
  private lifecycle: Promise<void> = Promise.resolve();

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.lifecycle.then(operation);
    this.lifecycle = result.then(
      () => {},
      () => {},
    );
    return result;
  }

  private visitor(socket: WebSocket): RoomVisitor | null {
    const attachment = socket.deserializeAttachment() as RoomVisitor | string | null;
    return attachment && typeof attachment === "object" ? attachment : null;
  }

  private viewerId(socket: WebSocket): string | null {
    const attachment = socket.deserializeAttachment() as RoomVisitor | string | null;
    return typeof attachment === "string" ? attachment : (attachment?.userId ?? null);
  }

  private async valid(visitor: RoomVisitor): Promise<boolean> {
    const result = await this.env.BIG_TWO_DB.prepare(`
      SELECT s.id FROM session s JOIN user u ON u.id = s.user_id
      JOIN room r ON r.id = ? AND r.status <> 'expiring'
        AND (r.expires_at IS NULL OR r.expires_at > ?)
      WHERE s.id = ? AND s.user_id = ? AND s.expires_at > ?
      AND NOT EXISTS (SELECT 1 FROM accountDeletion d WHERE d.user_id = s.user_id)
    `)
      .bind(visitor.roomId, Date.now(), visitor.sessionId, visitor.userId, Date.now())
      .first();
    return !!result;
  }

  private async available(roomId: string): Promise<boolean> {
    const room = await this.env.BIG_TWO_DB.prepare(
      "SELECT status, expires_at FROM room WHERE id = ?",
    )
      .bind(roomId)
      .first<{ status: string; expires_at: number | null }>();
    return (
      !!room &&
      room.status !== "expiring" &&
      (room.expires_at === null || room.expires_at > Date.now())
    );
  }

  async markConnected(roomId: string, userId: string, sessionId: string): Promise<boolean> {
    return this.serial(async () => {
      if (!(await this.valid({ roomId, userId, sessionId }))) return false;
      const row = await this.env.BIG_TWO_DB.prepare(
        "SELECT created_at, expires_at FROM room WHERE id = ? AND status <> 'expiring'",
      )
        .bind(roomId)
        .first<{ created_at: number | null; expires_at: number | null }>();
      if (!row || (row.expires_at !== null && row.expires_at <= Date.now())) return false;
      await this.env.BIG_TWO_DB.prepare(
        "UPDATE room SET expires_at = NULL, empty_since = NULL, visited = 1 WHERE id = ? AND status <> 'expiring'",
      )
        .bind(roomId)
        .run();
      return true;
    });
  }

  private async hasVisitors(roomId: string): Promise<boolean> {
    if ((await this.accessibleSockets()).length > 0) return true;
    return this.env.ROOM_CHAT_DURABLE_OBJECT.getByName(roomId).hasEligibleVisitors();
  }

  private async accessibleSockets(): Promise<WebSocket[]> {
    const accessible: WebSocket[] = [];
    for (const socket of this.ctx.getWebSockets()) {
      const visitor = this.visitor(socket);
      try {
        if (visitor && (await this.valid(visitor))) {
          accessible.push(socket);
          continue;
        }
      } catch (error) {
        console.error("Could not validate room connection", error);
      }
      try {
        socket.close(1008, "Room access ended");
      } catch {
        // A closed socket is no longer present even if closing it again fails.
      }
    }
    return accessible;
  }

  async visitorDeparted(roomId: string): Promise<void> {
    await this.serial(() => this.updateDeadline(roomId));
  }

  private async updateDeadline(roomId: string): Promise<void> {
    const room = await this.env.BIG_TWO_DB.prepare(
      "SELECT status, created_at, expires_at, empty_since, visited FROM room WHERE id = ?",
    )
      .bind(roomId)
      .first<{
        status: string;
        created_at: number | null;
        expires_at: number | null;
        empty_since: number | null;
        visited: number;
      }>();
    if (!room || room.status === "expiring" || room.created_at === null) return;
    if (await this.hasVisitors(roomId)) return;
    if (!room.visited) return; // Never opened: 48 hours from creation, not a new window.
    const stored = await this.getGameState();
    const state = stored ? (JSON.parse(stored) as BigTwoGameMachineSnapshot) : null;
    const paused = state && state.value !== "WAITING_FOR_PLAYERS" && state.value !== "GAME_END";
    const emptySince = room.empty_since ?? Date.now();
    const expiresAt = emptySince + (paused ? SEVEN_DAYS : TWO_DAYS);
    if (room.expires_at === expiresAt) return;
    await this.env.BIG_TWO_DB.prepare(
      "UPDATE room SET empty_since = ?, expires_at = ? WHERE id = ? AND status <> 'expiring'",
    )
      .bind(emptySince, expiresAt, roomId)
      .run();
  }

  private async removeRoom(roomId: string): Promise<void> {
    // The expiring marker denies all new access while cleanup is retried after any failure.
    await this.env.BIG_TWO_DB.prepare("INSERT OR IGNORE INTO retiredRoomCode (id) VALUES (?)")
      .bind(roomId)
      .run();
    await this.env.BIG_TWO_DB.prepare("DELETE FROM usersToRooms WHERE room_id = ?")
      .bind(roomId)
      .run();
    await this.env.ROOM_CHAT_DURABLE_OBJECT.getByName(roomId).removeRoom();
    for (const socket of this.ctx.getWebSockets()) socket.close(1008, "Room expired");
    await this.ctx.storage.deleteAll();
    await this.env.BIG_TWO_DB.prepare("DELETE FROM room WHERE id = ? AND status = 'expiring'")
      .bind(roomId)
      .run();
  }

  async reconcileExpiry(roomId: string): Promise<void> {
    await this.serial(async () => {
      const room = await this.env.BIG_TWO_DB.prepare(
        "SELECT status, created_at, expires_at FROM room WHERE id = ?",
      )
        .bind(roomId)
        .first<{ status: string; created_at: number | null; expires_at: number | null }>();
      if (!room) return;
      if (room.status === "expiring") return this.removeRoom(roomId);
      // Legacy data has no trustworthy last-departure timestamp. Rollout removes it immediately.
      // This deployment is explicitly for an installation with no existing visitors.
      if (room.created_at === null) {
        await this.env.BIG_TWO_DB.prepare("UPDATE room SET status = 'expiring' WHERE id = ?")
          .bind(roomId)
          .run();
        return this.removeRoom(roomId);
      }
      if (await this.hasVisitors(roomId)) {
        if (room.expires_at !== null)
          await this.env.BIG_TWO_DB.prepare(
            "UPDATE room SET expires_at = NULL, empty_since = NULL, visited = 1 WHERE id = ?",
          )
            .bind(roomId)
            .run();
        return;
      }
      if (room.expires_at === null) {
        await this.updateDeadline(roomId);
        return;
      }
      if (room.expires_at > Date.now()) return;
      await this.env.BIG_TWO_DB.prepare(
        "UPDATE room SET status = 'expiring' WHERE id = ? AND expires_at <= ?",
      )
        .bind(roomId, Date.now())
        .run();
      await this.removeRoom(roomId);
    });
  }

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
    roomId?: string,
  ): Promise<{ success: true } | { success: false; error: string }> {
    if (roomId && !(await this.available(roomId)))
      return { success: false, error: "Room not found" };
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
    if (
      event.type === "LEAVE_GAME" &&
      gameStateSnapshot.context.players.some((player) => player.id === requesterId)
    ) {
      return { success: false, error: "Could not leave the table. Please try again." };
    }
    const serialisedGameState = JSON.stringify(gameStateSnapshot);
    this.sql.exec(`UPDATE game_room SET game_state = ? WHERE id = 1`, serialisedGameState);
    const departingPlayer =
      event.type === "LEAVE_GAME"
        ? gameState.context.players.find((player) => player.id === requesterId)
        : undefined;
    // Everything after the SQLite write is best-effort: a committed action cannot be retried
    // safely just because notification or room housekeeping failed.
    try {
      await this.broadcast(
        gameStateSnapshot,
        undefined,
        departingPlayer && {
          playerId: requesterId,
          message:
            gameState.value === "WAITING_FOR_PLAYERS"
              ? `${departingPlayer.name} left the table.`
              : `${departingPlayer.name} left the table, so the game was reset.`,
        },
      );
    } catch (error) {
      console.error("Could not broadcast committed game action", error);
    }

    if (roomId && gameState.value !== gameStateSnapshot.value) {
      try {
        await this.visitorDeparted(roomId);
      } catch (error) {
        // A persisted game action must not be reported as failed by room housekeeping.
        console.error("Could not update room inactivity deadline", error);
      }
    }

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

  async getRoomView(viewerId: string, roomId?: string) {
    if (roomId && !(await this.available(roomId))) return null;
    const stored = await this.getGameState();
    if (!stored) return null;
    const state = JSON.parse(stored) as BigTwoGameMachineSnapshot;
    return roomView(state, viewerId, this.spectatorCount(state, await this.accessibleSockets()));
  }

  async getChatSeat(viewerId: string): Promise<{ seatName: string | null } | null> {
    const stored = await this.getGameState();
    if (!stored) return null;
    const state = JSON.parse(stored) as BigTwoGameMachineSnapshot;
    return {
      seatName: state.context.players.find((player) => player.id === viewerId)?.name ?? null,
    };
  }

  private spectatorCount(
    state: BigTwoGameMachineSnapshot,
    sockets: WebSocket[],
    excluding?: WebSocket,
  ) {
    const playerIds = new Set(state.context.players.map((player) => player.id));
    return new Set(
      sockets
        .filter((socket) => socket !== excluding)
        .map((socket) => this.viewerId(socket))
        .filter((id): id is string => !!id && !playerIds.has(id)),
    ).size;
  }

  private async broadcast(
    state: BigTwoGameMachineSnapshot,
    excluding?: WebSocket,
    notice?: { playerId: string; message: string },
  ) {
    const sockets = await this.accessibleSockets();
    const count = this.spectatorCount(state, sockets, excluding);
    for (const socket of sockets) {
      if (socket === excluding) continue;
      const viewerId = this.viewerId(socket);
      if (!viewerId) continue;
      try {
        socket.send(
          JSON.stringify({
            ...roomView(state, viewerId, count),
            ...(notice && viewerId !== notice.playerId ? { roomNotice: notice.message } : {}),
          }),
        );
      } catch {
        // A disconnected viewer must not turn a persisted game action into a failed request.
      }
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

  async redactPlayer(playerId: string) {
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

    await this.broadcast(redactedState);
  }

  async fetch(request: Request) {
    const viewerId = request.headers.get("X-Room-Viewer-ID");
    const sessionId = request.headers.get("X-Room-Session-ID");
    const roomId = request.headers.get("X-Room-ID");
    const stored = await this.getGameState();
    if (
      !viewerId ||
      !sessionId ||
      !roomId ||
      !stored ||
      !(await this.markConnected(roomId, viewerId, sessionId))
    )
      return new Response("Room not found", { status: 404 });
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);
    server.serializeAttachment({ roomId, userId: viewerId, sessionId } satisfies RoomVisitor);
    this.ctx.acceptWebSocket(server);
    // Recheck after acceptance so a departure cannot leave a deadline on a connected room.
    if (!(await this.markConnected(roomId, viewerId, sessionId))) {
      server.close(1008, "Room access ended");
      return new Response("Room not found", { status: 404 });
    }
    await this.broadcast(JSON.parse(stored) as BigTwoGameMachineSnapshot);

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

  async webSocketClose(
    ws: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean,
  ): Promise<void> {
    const visitor = this.visitor(ws);
    ws.serializeAttachment(null);
    const stored = this.sql.exec(`SELECT game_state FROM game_room WHERE id = 1`).toArray()[0];
    if (stored)
      await this.broadcast(
        JSON.parse(stored.game_state as string) as BigTwoGameMachineSnapshot,
        ws,
      );
    if (visitor) await this.visitorDeparted(visitor.roomId);
  }

  webSocketError(_ws: WebSocket, error: unknown) {
    console.error("WebSocket error:", error);
  }
}
