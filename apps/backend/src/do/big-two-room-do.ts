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
import {
  registeredEndpoint,
  sendTurnPush,
  turnEnrollments,
  type Enrollment,
} from "../lib/turn-push";

type RoomVisitor = { roomId: string; userId: string; sessionId: string };
const TWO_DAYS = 48 * 60 * 60 * 1000;
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
const FOCUS_TTL = 20_000;
const TURN_TTL = 5 * 60_000;

type OngoingTurn = { id: string; room_id: string; recipient_id: string; deadline: number };
const ONGOING_PHASES = ["ROUND_FIRST_MOVE", "NEXT_PLAYER_TURN", "PLAY_NEW_ROUND"] as const;
type Delivery = Enrollment & { attempts: number; next_at: number };

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
      CREATE TABLE IF NOT EXISTS room_focus(
        tab_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, session_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL, sequence INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS first_turn(
        id TEXT PRIMARY KEY, room_id TEXT NOT NULL, recipient_id TEXT NOT NULL,
        deadline INTEGER NOT NULL
      );
      -- first_turn is the existing persistent Turn slot, now used for every ongoing Turn.
      CREATE TABLE IF NOT EXISTS turn_delivery(
        turn_id TEXT NOT NULL, endpoint_id TEXT NOT NULL, session_id TEXT NOT NULL,
        generation INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
        next_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
        PRIMARY KEY(turn_id, endpoint_id)
      );
    `);
  }

  private activeFocus(userId: string): boolean {
    return (
      this.sql
        .exec<{ present: number }>(
          "SELECT 1 AS present FROM room_focus WHERE user_id = ? AND expires_at > ? LIMIT 1",
          userId,
          Date.now(),
        )
        .toArray().length > 0
    );
  }

  private async verifiedFocus(roomId: string, userId: string): Promise<boolean> {
    const rows = this.sql
      .exec<{ tab_id: string; session_id: string }>(
        "SELECT tab_id, session_id FROM room_focus WHERE user_id = ? AND expires_at > ?",
        userId,
        Date.now(),
      )
      .toArray();
    let present = false;
    for (const row of rows) {
      if (await this.valid({ roomId, userId, sessionId: row.session_id })) present = true;
      else
        this.sql.exec(
          "DELETE FROM room_focus WHERE tab_id = ? AND session_id = ?",
          row.tab_id,
          row.session_id,
        );
    }
    return present;
  }

  async setRoomFocus(
    roomId: string,
    userId: string,
    sessionId: string,
    tabId: string,
    focused: boolean,
    sequence: number,
  ): Promise<boolean> {
    if (
      !/^[a-f0-9-]{36}$/.test(tabId) ||
      !Number.isSafeInteger(sequence) ||
      sequence < 0 ||
      !(await this.valid({ roomId, userId, sessionId }))
    )
      return false;
    const stored = await this.getGameState();
    if (
      !stored ||
      !(JSON.parse(stored) as BigTwoGameMachineSnapshot).context.players.some(
        (p) => p.id === userId,
      )
    )
      return false;
    this.sql.exec("DELETE FROM room_focus WHERE expires_at < ?", Date.now() - 60_000);
    this.sql.exec(
      `INSERT INTO room_focus (tab_id, user_id, session_id, expires_at, sequence)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(tab_id) DO UPDATE SET expires_at = excluded.expires_at,
         sequence = excluded.sequence
       WHERE room_focus.user_id = excluded.user_id AND room_focus.session_id = excluded.session_id
         AND excluded.sequence > room_focus.sequence`,
      tabId,
      userId,
      sessionId,
      focused ? Date.now() + FOCUS_TTL : Date.now() - 1,
      sequence,
    );
    return true;
  }

  private currentTurn(turnId: string, roomId: string, userId: string): OngoingTurn | null {
    const turn = this.sql
      .exec<OngoingTurn>(
        "SELECT * FROM first_turn WHERE id = ? AND room_id = ? AND recipient_id = ? AND deadline > ?",
        turnId,
        roomId,
        userId,
        Date.now(),
      )
      .toArray()[0];
    if (!turn) return null;
    const state = this.sql
      .exec<{ game_state: string }>("SELECT game_state FROM game_room WHERE id = 1")
      .toArray()[0];
    if (!state) return null;
    const snapshot = JSON.parse(state.game_state) as BigTwoGameMachineSnapshot;
    return ONGOING_PHASES.some((phase) => phase === snapshot.value) &&
      snapshot.context.players[snapshot.context.currentPlayerIndex]?.id === userId
      ? turn
      : null;
  }

  // Invoked only from an authenticated Worker route, never with a client-asserted identity.
  async verifyTurn(
    roomId: string,
    turnId: string,
    userId: string,
    enrollment: Enrollment,
  ): Promise<boolean> {
    if (!this.currentTurn(turnId, roomId, userId)) return false;
    const captured = this.sql
      .exec(
        "SELECT 1 FROM turn_delivery WHERE turn_id = ? AND endpoint_id = ? AND session_id = ? AND generation = ? LIMIT 1",
        turnId,
        enrollment.endpoint_id,
        enrollment.session_id,
        enrollment.generation,
      )
      .toArray()[0];
    if (!captured) return false;
    if (!(await this.available(roomId))) return false;
    if (await this.verifiedFocus(roomId, userId)) return false;
    if (!(await registeredEndpoint(this.env, userId, enrollment))) return false;
    return !!this.currentTurn(turnId, roomId, userId) && !this.activeFocus(userId);
  }

  async repairTurn(roomId: string): Promise<void> {
    const turn = this.sql
      .exec<OngoingTurn>("SELECT * FROM first_turn WHERE room_id = ? LIMIT 1", roomId)
      .toArray()[0];
    if (!turn) return;
    if (turn.deadline <= Date.now()) {
      this.sql.exec("DELETE FROM turn_delivery WHERE turn_id = ?", turn.id);
      return;
    }
    const due = this.sql
      .exec<{ next_at: number }>(
        "SELECT next_at FROM turn_delivery WHERE turn_id = ? AND status = 'pending' ORDER BY next_at LIMIT 1",
        turn.id,
      )
      .toArray()[0];
    if (due) {
      const alarm = await this.ctx.storage.getAlarm();
      if (alarm === null || alarm > due.next_at)
        await this.ctx.storage.setAlarm(Math.max(Date.now(), due.next_at));
    }
  }

  async alarm(): Promise<void> {
    return this.serial(() => this.drainTurn());
  }

  private async drainTurn(): Promise<void> {
    const turn = this.sql.exec<OngoingTurn>("SELECT * FROM first_turn LIMIT 1").toArray()[0];
    if (!turn) return;
    const due = this.sql
      .exec<Delivery>(
        "SELECT * FROM turn_delivery WHERE turn_id = ? AND status = 'pending' AND next_at <= ? ORDER BY next_at LIMIT 4",
        turn.id,
        Date.now(),
      )
      .toArray();
    for (const delivery of due) {
      let outcome: "sent" | "retired" | "retry" = "retry";
      try {
        if (await this.verifyTurn(turn.room_id, turn.id, turn.recipient_id, delivery)) {
          // The second check closes the common race where a Player focuses the room during D1 verification.
          const registration = await registeredEndpoint(this.env, turn.recipient_id, delivery);
          if (
            registration &&
            this.currentTurn(turn.id, turn.room_id, turn.recipient_id) &&
            !this.activeFocus(turn.recipient_id)
          )
            outcome = await sendTurnPush(
              this.env,
              registration,
              {
                roomId: turn.room_id,
                turnId: turn.id,
                endpointId: delivery.endpoint_id,
              },
              turn.deadline,
            );
          else outcome = "retired";
        } else outcome = "retired";
      } catch {
        // Do not log subscription secrets or provider bodies. Bounded retry handles temporary outages.
      }
      if (outcome === "sent") {
        this.sql.exec(
          "UPDATE turn_delivery SET status = 'sent' WHERE turn_id = ? AND endpoint_id = ?",
          turn.id,
          delivery.endpoint_id,
        );
      } else if (outcome === "retired" || delivery.attempts >= 2 || Date.now() >= turn.deadline) {
        this.sql.exec(
          "DELETE FROM turn_delivery WHERE turn_id = ? AND endpoint_id = ?",
          turn.id,
          delivery.endpoint_id,
        );
      } else {
        this.sql.exec(
          "UPDATE turn_delivery SET attempts = attempts + 1, next_at = ? WHERE turn_id = ? AND endpoint_id = ?",
          Date.now() + 15_000 * (delivery.attempts + 1),
          turn.id,
          delivery.endpoint_id,
        );
      }
    }
    try {
      await this.repairTurn(turn.room_id);
    } catch {
      /* The scheduled room sweep can restore a lost alarm. */
    }
  }

  async gameAction(
    event: GameEvent,
    requesterId: string,
    roomId?: string,
  ): Promise<{ success: true } | { success: false; error: string }> {
    return this.serial(() => this.commitGameAction(event, requesterId, roomId));
  }

  private async commitGameAction(
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
    // Only a committed, accepted action that starts a Turn may allocate an identity.
    // In particular, the final pass returns the lead to the same player index.
    const startsTurn =
      !!roomId &&
      ((event.type === "START_GAME" &&
        gameState.value === "WAITING_FOR_PLAYERS" &&
        gameStateSnapshot.value === "ROUND_FIRST_MOVE") ||
        (event.type === "PLAY_FIRST_MOVE" &&
          gameState.value === "ROUND_FIRST_MOVE" &&
          gameStateSnapshot.value === "NEXT_PLAYER_TURN") ||
        (event.type === "PLAY_CARDS" &&
          gameState.value === "NEXT_PLAYER_TURN" &&
          gameStateSnapshot.value === "NEXT_PLAYER_TURN" &&
          gameState.context.currentPlayerIndex !== gameStateSnapshot.context.currentPlayerIndex) ||
        (event.type === "PASS_TURN" &&
          gameState.value === "NEXT_PLAYER_TURN" &&
          (gameStateSnapshot.value === "NEXT_PLAYER_TURN" ||
            gameStateSnapshot.value === "PLAY_NEW_ROUND") &&
          gameState.context.currentPlayerIndex !== gameStateSnapshot.context.currentPlayerIndex) ||
        (event.type === "PLAY_NEW_ROUND_FIRST_MOVE" &&
          gameState.value === "PLAY_NEW_ROUND" &&
          gameStateSnapshot.value === "NEXT_PLAYER_TURN"));
    const recipientId = startsTurn
      ? gameStateSnapshot.context.players[gameStateSnapshot.context.currentPlayerIndex]?.id
      : undefined;
    let enrollments: Enrollment[] = [];
    if (recipientId) {
      try {
        enrollments = await turnEnrollments(this.env, recipientId);
        await this.verifiedFocus(roomId!, recipientId);
      } catch {
        /* Eligibility is unverified: commit the deal without an alert. */
        enrollments = [];
      }
    }
    const serialisedGameState = JSON.stringify(gameStateSnapshot);
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(`UPDATE game_room SET game_state = ? WHERE id = 1`, serialisedGameState);
      if (startsTurn || !ONGOING_PHASES.some((phase) => phase === gameStateSnapshot.value)) {
        this.sql.exec("DELETE FROM turn_delivery");
        this.sql.exec("DELETE FROM first_turn");
      }
      if (roomId && recipientId) {
        const id = crypto.randomUUID();
        const deadline = Date.now() + TURN_TTL;
        this.sql.exec(
          "INSERT INTO first_turn (id, room_id, recipient_id, deadline) VALUES (?, ?, ?, ?)",
          id,
          roomId,
          recipientId,
          deadline,
        );
        if (!this.activeFocus(recipientId))
          for (const enrollment of enrollments) {
            this.sql.exec(
              `INSERT INTO turn_delivery (turn_id, endpoint_id, session_id, generation, next_at)
            VALUES (?, ?, ?, ?, ?)`,
              id,
              enrollment.endpoint_id,
              enrollment.session_id,
              enrollment.generation,
              Date.now(),
            );
          }
      }
    });
    const departingPlayer =
      event.type === "LEAVE_GAME"
        ? gameState.context.players.find((player) => player.id === requesterId)
        : undefined;
    // Everything after the SQLite write is best-effort: a committed action cannot be retried
    // safely just because notification or room housekeeping failed.
    if (roomId && recipientId) {
      try {
        await this.repairTurn(roomId);
      } catch (error) {
        console.error("Could not schedule committed Turn", error);
      }
    }
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
        await this.updateDeadline(roomId);
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
    this.sql.exec("DELETE FROM turn_delivery");
    this.sql.exec("DELETE FROM first_turn");

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
