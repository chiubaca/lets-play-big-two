import { createActor } from "xstate";
import Database from "better-sqlite3";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { bigTwoGameMachine, type BigTwoGameMachineSnapshot } from "@big-two/game-state-machine";
import { chooseBotMove, createJevBotMovePlan } from "@big-two/game-ai";
import { BigTwoRoomObject } from "./big-two-room-do";
import type { JevAiBinding } from "../lib/jev-bot";

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
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

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
          else if (query.startsWith("SELECT") || query.startsWith("PRAGMA")) {
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
  const ai = {
    run: vi.fn<JevAiBinding["run"]>().mockImplementation(async (_, input) => ({
      model: "jev-test",
      answers: Object.fromEntries(
        Object.entries(input.questions).map(([id, question]) => {
          const choice = Object.keys(question.criteria)[0];
          return [id, { type: "choice", choice, confidence: 1, probabilities: { [choice]: 1 } }];
        }),
      ),
      usage: { input_tokens: 1, output_tokens: 1 },
    })),
  };
  const env = {
    BIG_TWO_DB: db,
    ROOM_CHAT_DURABLE_OBJECT: { getByName: () => chat },
    AI: ai,
  } as unknown as Env;
  return {
    object: new BigTwoRoomObject(ctx, env),
    reload: () => new BigTwoRoomObject(ctx, env),
    snapshot: () => JSON.parse(stored().game_state) as BigTwoGameMachineSnapshot,
    turnRecipient: () =>
      (
        sqlite.prepare("SELECT recipient_id FROM first_turn LIMIT 1").get() as
          | { recipient_id: string }
          | undefined
      )?.recipient_id,
    writes: () => writes,
    row,
    chat,
    ai,
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

it("allows only the Host to fill seats and remove bots, opening a seat for a human", async () => {
  const r = createRoomHarness();
  expect(await r.object.gameAction({ type: "FILL_WITH_BOTS" }, "bob", "ABCDE")).toEqual({
    success: false,
    error: "Only the Host can manage the game",
  });
  expect(await r.object.gameAction({ type: "FILL_WITH_BOTS" }, "ada", "ABCDE")).toEqual({
    success: true,
  });
  const bots = r.snapshot().context.players.filter((p) => p.isBot);
  expect(bots).toHaveLength(2);
  expect(await r.object.gameAction({ type: "REMOVE_BOT", botId: "bob" }, "ada", "ABCDE")).toEqual({
    success: false,
    error: "That seat is not a bot",
  });
  await r.object.gameAction({ type: "START_GAME" }, "ada", "ABCDE");
  expect(
    await r.object.gameAction({ type: "REMOVE_BOT", botId: bots[0].id }, "bob", "ABCDE"),
  ).toEqual({ success: false, error: "Only the Host can manage the game" });
  expect(
    await r.reload().gameAction({ type: "REMOVE_BOT", botId: bots[0].id }, "ada", "ABCDE"),
  ).toEqual({ success: true });
  expect(r.snapshot().value).toBe("WAITING_FOR_PLAYERS");
  expect(r.snapshot().context.players).toHaveLength(3);
  expect(r.snapshot().context.players.every((p) => p.hand.length === 0)).toBe(true);
  await r
    .reload()
    .gameAction({ type: "JOIN_GAME", playerId: "eve", playerName: "Eve" }, "eve", "ABCDE");
  expect(r.snapshot().context.players.map((p) => p.id)).toContain("eve");
});

it("runs persisted bot turns on alarms without allowing client impersonation", async () => {
  const r = createRoomHarness();
  await r.object.gameAction({ type: "FILL_WITH_BOTS" }, "ada", "ABCDE");
  await r.object.gameAction({ type: "START_GAME" }, "ada", "ABCDE");
  let state = r.snapshot();
  // Move through human turns until a bot is up.
  if (!state.context.players[state.context.currentPlayerIndex].isBot) {
    const starter = state.context.players[state.context.currentPlayerIndex];
    await r.object.gameAction(
      { type: "PLAY_FIRST_MOVE", playerId: starter.id, cards: [{ value: "3", suit: "DIAMOND" }] },
      starter.id,
      "ABCDE",
    );
    state = r.snapshot();
    if (!state.context.players[state.context.currentPlayerIndex].isBot) {
      const next = state.context.players[state.context.currentPlayerIndex];
      await r.object.gameAction({ type: "PASS_TURN", playerId: next.id }, next.id, "ABCDE");
    }
  }
  state = r.snapshot();
  const bot = state.context.players[state.context.currentPlayerIndex];
  expect(bot.isBot).toBe(true);
  expect(
    await r.object.gameAction({ type: "PASS_TURN", playerId: bot.id }, bot.id, "ABCDE"),
  ).toEqual({ success: false, error: "You are not a participant in this room" });
  vi.setSystemTime(NOW + 1000);
  await r.reload().alarm();
  expect(r.snapshot().context.currentPlayerIndex).not.toBe(state.context.currentPlayerIndex);
  const after = r.snapshot();
  await r.reload().alarm();
  expect(r.snapshot()).toEqual(after); // Duplicate delivery cannot skip a turn.
  await r.object.gameAction({ type: "REMOVE_BOT", botId: bot.id }, "ada", "ABCDE");
  vi.setSystemTime(NOW + 3000);
  await r.reload().alarm();
  expect(r.snapshot().value).toBe("WAITING_FOR_PLAYERS");
  expect(r.snapshot().context.cardPile).toEqual([]);
});

it("uses Jev's selected legal move for persisted online bots after reload", async () => {
  vi.spyOn(Math, "random").mockReturnValue(0);
  const r = createRoomHarness();
  await r.object.gameAction({ type: "FILL_WITH_BOTS" }, "ada", "ABCDE");
  await r.object.gameAction({ type: "START_GAME" }, "ada", "ABCDE");
  const before = r.snapshot();
  const player = before.context.players[before.context.currentPlayerIndex];
  expect(player.isBot).toBe(true);
  const plan = createJevBotMovePlan({
    hand: player.hand,
    playedHands: [],
    roundMode: null,
    requiredCard: { value: "3", suit: "DIAMOND" },
    opponentHandSizes: [13, 13, 13],
  });
  const choice = Object.keys(plan.moves).at(-1)!;
  expect(plan.moves[choice]).not.toEqual(plan.fallback);
  r.ai.run.mockResolvedValueOnce({
    model: "jev-test",
    answers: {
      best_move: { type: "choice", choice, confidence: 1, probabilities: { [choice]: 1 } },
    },
    usage: { input_tokens: 1, output_tokens: 1 },
  });
  vi.setSystemTime(NOW + 1000);
  await r.reload().alarm();
  expect(r.ai.run).toHaveBeenCalledOnce();
  expect(r.ai.run.mock.calls[0][0]).toBe("typesafe/jev");
  expect(r.ai.run.mock.calls[0][1].state).toEqual(plan.state);
  expect(r.snapshot().context.cardPile).toEqual([plan.moves[choice]]);
  expect(r.snapshot().context.players.find((entry) => entry.id === player.id)!.usesJev).toBe(true);
  expect(
    (await r.reload().getRoomView("spectator", "ABCDE"))!.context.players.find(
      (entry) => entry.id === player.id,
    )!.usesJev,
  ).toBe(true);
  expect(
    (await r.reload().getRoomView("ada", "ABCDE"))!.context.players
      .filter((entry) => entry.isBot)
      .every((entry) => entry.hand.length === 0),
  ).toBe(true);
  const after = r.snapshot();
  await r.reload().alarm();
  expect(r.snapshot()).toEqual(after);
  expect(r.ai.run).toHaveBeenCalledOnce();
  await r.object.gameAction({ type: "RESET_GAME" }, "ada", "ABCDE");
  expect(r.snapshot().context.players.every((entry) => !entry.usesJev)).toBe(true);
});

it("honors a Jev strategic pass and then asks Jev for the next bot's new-round lead", async () => {
  vi.spyOn(Math, "random").mockReturnValue(0);
  const r = createRoomHarness();
  await r.object.gameAction({ type: "FILL_WITH_BOTS" }, "ada", "ABCDE");
  await r.object.gameAction({ type: "START_GAME" }, "ada", "ABCDE");
  vi.setSystemTime(NOW + 1000);
  await r.reload().alarm();
  await r.object.gameAction({ type: "PASS_TURN", playerId: "ada" }, "ada", "ABCDE");
  await r.object.gameAction({ type: "PASS_TURN", playerId: "bob" }, "bob", "ABCDE");
  const before = r.snapshot();
  expect(before.context.players[before.context.currentPlayerIndex].isBot).toBe(true);
  r.ai.run.mockResolvedValueOnce({
    model: "jev-test",
    answers: {
      play_or_pass: { type: "choice", choice: "pass", confidence: 1, probabilities: { pass: 1 } },
    },
    usage: { input_tokens: 1, output_tokens: 1 },
  });
  vi.setSystemTime(NOW + 2000);
  await r.reload().alarm();
  expect(r.snapshot().context.cardPile).toEqual(before.context.cardPile);
  expect(r.snapshot().value).toBe("PLAY_NEW_ROUND");
  expect(r.ai.run.mock.calls[1][1].questions).toHaveProperty("play_or_pass");
  vi.setSystemTime(NOW + 3000);
  await r.reload().alarm();
  expect(r.ai.run.mock.calls[2][1].questions).toHaveProperty("best_move");
  expect(r.ai.run.mock.calls[2][1].questions).not.toHaveProperty("play_or_pass");
  expect(r.snapshot().context.cardPile).toHaveLength(before.context.cardPile.length + 1);
});

it("falls back to a legal move when online bot inference fails", async () => {
  vi.spyOn(Math, "random").mockReturnValue(0);
  vi.spyOn(console, "error").mockImplementation(() => {});
  const r = createRoomHarness();
  r.ai.run.mockRejectedValue(new Error("AI unavailable"));
  await r.object.gameAction({ type: "FILL_WITH_BOTS" }, "ada", "ABCDE");
  await r.object.gameAction({ type: "START_GAME" }, "ada", "ABCDE");
  vi.setSystemTime(NOW + 1000);
  await r.reload().alarm();
  expect(r.ai.run).toHaveBeenCalledOnce();
  expect(r.snapshot().context.cardPile).toEqual([[{ value: "3", suit: "DIAMOND" }]]);
  expect(r.snapshot().context.players.every((entry) => !entry.usesJev)).toBe(true);
});

it("clears previously verified online badges when Jev falls back on a later bot turn", async () => {
  vi.spyOn(Math, "random").mockReturnValue(0);
  vi.spyOn(console, "error").mockImplementation(() => {});
  const r = createRoomHarness();
  await r.object.gameAction({ type: "FILL_WITH_BOTS" }, "ada", "ABCDE");
  await r.object.gameAction({ type: "START_GAME" }, "ada", "ABCDE");
  vi.setSystemTime(NOW + 1000);
  await r.reload().alarm();
  expect(r.snapshot().context.players.some((player) => player.usesJev)).toBe(true);
  await r.object.gameAction({ type: "PASS_TURN", playerId: "ada" }, "ada", "ABCDE");
  await r.object.gameAction({ type: "PASS_TURN", playerId: "bob" }, "bob", "ABCDE");
  r.ai.run.mockRejectedValueOnce(new Error("Jev unavailable"));
  vi.setSystemTime(NOW + 2000);
  await r.reload().alarm();
  expect(r.snapshot().context.players.every((player) => !player.usesJev)).toBe(true);
  expect(
    (await r.reload().getRoomView("spectator", "ABCDE"))!.context.players.every(
      (player) => !player.usesJev,
    ),
  ).toBe(true);
});

it("plays a complete mixed table through consecutive bot turns and human notification handoffs", async () => {
  const r = createRoomHarness();
  await r.object.gameAction({ type: "FILL_WITH_BOTS" }, "ada", "ABCDE");
  await r.object.gameAction({ type: "START_GAME" }, "ada", "ABCDE");
  let botTurns = 0;
  let humanTurns = 0;
  for (let turn = 0; turn < 500 && r.snapshot().value !== "GAME_END"; turn++) {
    const state = r.snapshot();
    const player = state.context.players[state.context.currentPlayerIndex];
    if (player.isBot) {
      botTurns++;
      expect(r.turnRecipient()).toBeUndefined();
      vi.setSystemTime(NOW + (turn + 1) * 1000);
      await r.reload().alarm();
    } else {
      humanTurns++;
      expect(r.turnRecipient()).toBe(player.id);
      const cards = chooseBotMove({
        hand: player.hand,
        roundMode: state.context.roundMode,
        cardsToBeat: state.value === "NEXT_PLAYER_TURN" ? state.context.cardPile.at(-1) : undefined,
        requiredCard:
          state.value === "ROUND_FIRST_MOVE" ? { value: "3", suit: "DIAMOND" } : undefined,
      });
      expect(
        await r.reload().gameAction(
          cards
            ? {
                type:
                  state.value === "ROUND_FIRST_MOVE"
                    ? "PLAY_FIRST_MOVE"
                    : state.value === "PLAY_NEW_ROUND"
                      ? "PLAY_NEW_ROUND_FIRST_MOVE"
                      : "PLAY_CARDS",
                playerId: player.id,
                cards,
              }
            : { type: "PASS_TURN", playerId: player.id },
          player.id,
          "ABCDE",
        ),
      ).toEqual({ success: true });
    }
  }
  expect(r.snapshot().value).toBe("GAME_END");
  expect(botTurns).toBeGreaterThan(1);
  expect(humanTurns).toBeGreaterThan(1);
  expect(r.turnRecipient()).toBeUndefined();
  const finished = r.snapshot();
  vi.setSystemTime(NOW + 1_000_000);
  await r.reload().alarm();
  expect(r.snapshot()).toEqual(finished);
});
