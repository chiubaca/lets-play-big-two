import { createActor } from "xstate";
import Database from "better-sqlite3";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { bigTwoGameMachine, type BigTwoGameMachineSnapshot } from "@big-two/game-state-machine";
import { BigTwoRoomObject } from "./big-two-room-do";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    ctx: unknown;
    env: unknown;
    constructor(ctx: unknown, env: unknown) {
      this.ctx = ctx;
      this.env = env;
    }
  },
}));

const NOW = 1_800_000_000_000;
const TWO_DAYS = 48 * 60 * 60 * 1000;
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
afterEach(() => vi.useRealTimers());

function createRoomHarness() {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const actor = createActor(bigTwoGameMachine).start();
  actor.send({ type: "JOIN_GAME", playerId: "ada", playerName: "Ada" });
  actor.send({ type: "JOIN_GAME", playerId: "bob", playerName: "Bob" });
  const sqlite = new Database(":memory:");
  sqlite.exec("CREATE TABLE game_room(id INTEGER PRIMARY KEY, game_state TEXT)");
  sqlite
    .prepare("INSERT INTO game_room VALUES (1, ?)")
    .run(JSON.stringify(actor.getPersistedSnapshot()));
  const stored = () =>
    sqlite.prepare("SELECT game_state FROM game_room WHERE id = 1").get() as { game_state: string };
  let writes = 0;
  let broadcastFails = false;
  let housekeepingFails = false;
  const chat = {
    hasEligibleVisitors: vi.fn(async () => {
      if (housekeepingFails) throw new Error("chat unavailable");
      return false;
    }),
  };
  const row = {
    status: "waiting",
    created_at: NOW,
    expires_at: null as number | null,
    empty_since: null as number | null,
    visited: 1,
  };
  const db = {
    prepare: (query: string) => ({
      bind: (...args: unknown[]) => ({
        first: async () =>
          query.includes("SELECT status, expires_at")
            ? { status: row.status, expires_at: row.expires_at }
            : { ...row },
        all: async () => ({ results: [] }),
        run: async () => {
          if (query.startsWith("UPDATE room SET empty_since")) {
            row.empty_since = args[0] as number;
            row.expires_at = args[1] as number;
          }
        },
      }),
    }),
  };
  const ctx = {
    storage: {
      sql: {
        exec: (query: string, ...values: unknown[]) => {
          if (query.startsWith("UPDATE game_room")) writes++;
          if (query.includes("CREATE TABLE")) sqlite.exec(query);
          else if (query.startsWith("SELECT")) {
            return { toArray: () => sqlite.prepare(query).all(...values) };
          } else sqlite.prepare(query).run(...values);
          return { toArray: () => [] };
        },
      },
      transactionSync: (fn: () => void) => sqlite.transaction(fn)(),
      getAlarm: async () => null,
      setAlarm: async () => {},
    },
    getWebSockets: () => {
      if (broadcastFails) {
        broadcastFails = false;
        throw new Error("broadcast unavailable");
      }
      return [];
    },
  } as unknown as DurableObjectState;
  const env = {
    BIG_TWO_DB: db,
    ROOM_CHAT_DURABLE_OBJECT: { getByName: () => chat },
  } as unknown as Env;
  return {
    object: new BigTwoRoomObject(ctx, env),
    reload: () => new BigTwoRoomObject(ctx, env),
    snapshot: () => JSON.parse(stored().game_state) as BigTwoGameMachineSnapshot,
    writes: () => writes,
    row,
    chat,
    failBroadcast: () => {
      broadcastFails = true;
    },
    failHousekeeping: () => {
      housekeepingFails = true;
    },
  };
}

it("persists a deal, first play and pass, and reloads the accepted transitions", async () => {
  const r = createRoomHarness();
  expect(await r.object.gameAction({ type: "START_GAME" }, "ada", "ABCDE")).toEqual({
    success: true,
  });
  expect(r.snapshot().value).toBe("ROUND_FIRST_MOVE");
  expect(r.snapshot().context.players.every((player) => player.hand.length === 26)).toBe(true);
  expect(r.row.expires_at).toBe(NOW + SEVEN_DAYS);
  const starter = r
    .snapshot()
    .context.players.find((player) =>
      player.hand.some((card) => card.value === "3" && card.suit === "DIAMOND"),
    )!;
  expect(
    await r
      .reload()
      .gameAction(
        { type: "PLAY_FIRST_MOVE", playerId: starter.id, cards: [{ value: "3", suit: "DIAMOND" }] },
        starter.id,
        "ABCDE",
      ),
  ).toEqual({ success: true });
  expect(r.snapshot().value).toBe("NEXT_PLAYER_TURN");
  expect(r.snapshot().context.cardPile).toEqual([[{ value: "3", suit: "DIAMOND" }]]);
  expect(
    r.snapshot().context.players.find((player) => player.id === starter.id)?.hand,
  ).toHaveLength(25);
  const next = r.snapshot().context.players[r.snapshot().context.currentPlayerIndex];
  expect(
    await r.reload().gameAction({ type: "PASS_TURN", playerId: next.id }, next.id, "ABCDE"),
  ).toEqual({ success: true });
  expect(r.snapshot().value).toBe("PLAY_NEW_ROUND");
  expect(r.snapshot().context.players[r.snapshot().context.currentPlayerIndex].id).toBe(starter.id);
  expect(r.writes()).toBe(3);
  expect((await r.reload().getRoomView("ada", "ABCDE"))?.value).toBe("PLAY_NEW_ROUND");
});

it("rejects unauthorized and invalid turn actions without changing persisted state", async () => {
  const r = createRoomHarness();
  expect(await r.object.gameAction({ type: "START_GAME" }, "bob", "ABCDE")).toEqual({
    success: false,
    error: "Only the Host can manage the game",
  });
  expect(r.writes()).toBe(0);
  await r.object.gameAction({ type: "START_GAME" }, "ada", "ABCDE");
  const before = r.snapshot();
  const wrongPlayer = before.context.players.find(
    (player) => player.id !== before.context.players[before.context.currentPlayerIndex].id,
  )!;
  expect(
    await r.object.gameAction(
      {
        type: "PLAY_FIRST_MOVE",
        playerId: wrongPlayer.id,
        cards: [{ value: "3", suit: "DIAMOND" }],
      },
      wrongPlayer.id,
      "ABCDE",
    ),
  ).toEqual({ success: false, error: "It is not your turn" });
  expect(r.writes()).toBe(1);
  expect(r.snapshot()).toEqual(before);
  expect((await r.reload().getRoomView("ada", "ABCDE"))?.value).toBe("ROUND_FIRST_MOVE");
  const starter = before.context.players[before.context.currentPlayerIndex];
  await r.object.gameAction(
    { type: "PLAY_FIRST_MOVE", playerId: starter.id, cards: [{ value: "3", suit: "DIAMOND" }] },
    starter.id,
    "ABCDE",
  );
  const afterPlay = r.snapshot();
  expect(
    await r.reload().gameAction({ type: "PASS_TURN", playerId: starter.id }, starter.id, "ABCDE"),
  ).toEqual({ success: false, error: "It is not your turn" });
  expect(r.writes()).toBe(2);
  expect(r.snapshot()).toEqual(afterPlay);
});

it.each(["broadcast", "housekeeping", "both"] as const)(
  "keeps accepted deal, play and pass after %s fails post-commit",
  async (failure) => {
    const r = createRoomHarness();
    if (failure !== "housekeeping") r.failBroadcast();
    if (failure !== "broadcast") r.failHousekeeping();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await r.object.gameAction({ type: "START_GAME" }, "ada", "ABCDE")).toEqual({
        success: true,
      });
      expect(r.snapshot().value).toBe("ROUND_FIRST_MOVE");
      const starter = r.snapshot().context.players[r.snapshot().context.currentPlayerIndex];
      if (failure !== "housekeeping") r.failBroadcast();
      expect(
        await r.reload().gameAction(
          {
            type: "PLAY_FIRST_MOVE",
            playerId: starter.id,
            cards: [{ value: "3", suit: "DIAMOND" }],
          },
          starter.id,
          "ABCDE",
        ),
      ).toEqual({ success: true });
      expect(r.snapshot().value).toBe("NEXT_PLAYER_TURN");
      const next = r.snapshot().context.players[r.snapshot().context.currentPlayerIndex];
      if (failure !== "housekeeping") r.failBroadcast();
      expect(
        await r.reload().gameAction({ type: "PASS_TURN", playerId: next.id }, next.id, "ABCDE"),
      ).toEqual({ success: true });
      expect(r.snapshot().value).toBe("PLAY_NEW_ROUND");
      expect(await r.reload().getGameState()).toBe(JSON.stringify(r.snapshot()));
      expect(r.writes()).toBe(3);
      if (failure === "broadcast") expect(r.row.expires_at).toBe(NOW + SEVEN_DAYS);
      if (failure === "both") expect(r.chat.hasEligibleVisitors).toHaveBeenCalled();
      if (failure !== "housekeeping") {
        expect(
          error.mock.calls.filter(
            ([message]) => message === "Could not broadcast committed game action",
          ),
        ).toHaveLength(3);
      }
    } finally {
      error.mockRestore();
    }
  },
);

it("shortens an empty unfinished room's deadline when leaving resets play", async () => {
  const r = createRoomHarness();
  await r.object.gameAction({ type: "START_GAME" }, "ada", "ABCDE");
  expect(r.row.expires_at).toBe(NOW + SEVEN_DAYS);
  expect(
    await r.object.gameAction({ type: "LEAVE_GAME", playerId: "bob" }, "bob", "ABCDE"),
  ).toEqual({ success: true });
  expect(r.snapshot().value).toBe("WAITING_FOR_PLAYERS");
  expect(r.row.expires_at).toBe(NOW + TWO_DAYS);
  expect(
    (await r.reload().getRoomView("ada", "ABCDE"))?.context.players.map((player) => player.id),
  ).toEqual(["ada"]);
});
