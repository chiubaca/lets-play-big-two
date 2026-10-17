import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createPlayEvent, type OfflineGameConfig, type OfflineMode } from "./game-helpers";
import { getStorageKey, restoreGame, type LocalGameStorage } from "./game-persistence";
import { BOT_THINKING_DELAY_MS, OfflineGameSession } from "./offline-game-session";
import { JEV_REQUEST_TIMEOUT_MS } from "./offline-game-session";
import {
  createJevBotClient,
  type JevBotMoveRequester,
  type JevBotMoveDecision,
} from "./jev-bot-client";
import { getLegalPlays } from "@big-two/game-ai";

const sessions: OfflineGameSession[] = [];

function createSession(
  mode: OfflineMode = "solo",
  storage?: LocalGameStorage,
  active = true,
  config?: OfflineGameConfig,
  requestJevBotMove?: JevBotMoveRequester,
) {
  const session = new OfflineGameSession(mode, storage, active, config, requestJevBotMove);
  sessions.push(session);
  return session;
}

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: vi.fn(async (key: string) => data.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      data.set(key, value);
    }),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  // Fisher-Yates places 3♦ with the fourth seat, giving a deterministic bot opening.
  vi.spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => {
  sessions.splice(0).forEach((session) => session.dispose());
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("native solo sessions", () => {
  it("joins four fixed seats, hides bots, and makes a legal opening after exactly 800ms", async () => {
    const session = createSession();
    await session.initialize();
    const before = session.getView();
    expect(before.ready).toBe(true);
    expect(before.isBotTurn).toBe(true);
    expect(before.thinkingPlayerId).toBe("local-bot-3");
    expect(before.handCounts).toEqual({
      "local-you": 13,
      "local-bot-1": 13,
      "local-bot-2": 13,
      "local-bot-3": 13,
    });
    expect(
      before.snapshot!.context.players.slice(1).every((player) => player.hand.length === 0),
    ).toBe(true);
    vi.advanceTimersByTime(BOT_THINKING_DELAY_MS - 1);
    expect(session.getView()).toBe(before);
    vi.advanceTimersByTime(1);
    expect(session.getView().snapshot!.context.cardPile).toEqual([
      [{ suit: "DIAMOND", value: "3" }],
    ]);
    expect(session.getView().isBotTurn).toBe(false);
    expect(session.getView().thinkingPlayerId).toBeUndefined();
    const humanTurn = session.getView();
    vi.advanceTimersByTime(5000);
    expect(session.getView()).toBe(humanTurn);
  });

  it("cancels bots on background and restarts their full delay on resume", async () => {
    const session = createSession();
    await session.initialize();
    vi.advanceTimersByTime(500);
    session.setActive(false);
    expect(
      session.getView().snapshot!.context.players.every((player) => player.hand.length === 0),
    ).toBe(true);
    expect(session.getView().thinkingPlayerId).toBeUndefined();
    vi.advanceTimersByTime(10_000);
    expect(session.getView().snapshot!.context.cardPile).toHaveLength(0);
    session.setActive(true);
    vi.advanceTimersByTime(799);
    expect(session.getView().snapshot!.context.cardPile).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(session.getView().snapshot!.context.cardPile).toHaveLength(1);
  });

  it("does not schedule background launches, and cleans up timers and subscriptions", async () => {
    const session = createSession("solo", undefined, false);
    const listener = vi.fn();
    session.subscribe(listener);
    await session.initialize();
    expect(vi.getTimerCount()).toBe(0);
    session.setActive(true);
    expect(vi.getTimerCount()).toBe(1);
    session.dispose();
    const calls = listener.mock.calls.length;
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(10_000);
    expect(listener).toHaveBeenCalledTimes(calls);
  });

  it("blocks bot and seat-management events from the UI and redeals without duplicated timers", async () => {
    const session = createSession();
    await session.initialize();
    const initial = session.getView();
    session.send({ type: "FILL_WITH_BOTS" });
    session.send({ type: "LEAVE_GAME", playerId: "local-you" });
    session.send({
      type: "PLAY_FIRST_MOVE",
      playerId: "local-bot-3",
      cards: [{ suit: "DIAMOND", value: "3" }],
    });
    expect(session.getView()).toBe(initial);
    session.reset();
    expect(vi.getTimerCount()).toBe(1);
    expect(session.getView().snapshot!.context.players).toHaveLength(4);
    expect(session.getView().snapshot!.context.cardPile).toHaveLength(0);
    vi.advanceTimersByTime(800);
    expect(session.getView().snapshot!.context.cardPile).toHaveLength(1);
  });
});

describe("native pass-and-play sessions", () => {
  it.each([2, 3, 4])(
    "deals all 52 cards to a configured %i-seat table and restores it",
    async (seatCount) => {
      const config: OfflineGameConfig = {
        players: Array.from({ length: seatCount }, (_, index) => ({
          name: `Friend ${index + 1}`,
          isBot: false,
        })),
      };
      const storage = memoryStorage();
      const session = createSession("pass-and-play", storage, true, config);
      await session.initialize();
      expect(session.getView().snapshot!.context.players.map((player) => player.name)).toEqual(
        config.players.map((player) => player.name),
      );
      expect(
        Object.values(session.getView().handCounts).reduce((total, count) => total + count, 0),
      ).toBe(52);
      session.revealHand();
      const before = session.getView().snapshot!;
      const playerId = session.getView().visiblePlayerId!;
      session.send(createPlayEvent(before, playerId, session.requestHint()!)!);
      const played = session.getView().snapshot!;
      session.dispose();
      const restored = createSession("pass-and-play", storage, true, config);
      await restored.initialize();
      expect(restored.getView().error).toBeNull();
      expect(restored.getView().snapshot!.context.cardPile).toEqual(played.context.cardPile);
      expect(restored.getView().snapshot!.context.players).toHaveLength(seatCount);
      expect(restored.getView().visiblePlayerId).toBeUndefined();
    },
  );

  it("automates configured pass-and-play bots while hiding all hands until human handoff", async () => {
    const config: OfflineGameConfig = {
      players: [
        { name: "Alex", isBot: false },
        { name: "Blair", isBot: false },
        { name: "Ada", isBot: true },
        { name: "May", isBot: true },
      ],
    };
    const session = createSession("pass-and-play", undefined, true, config);
    await session.initialize();
    expect(session.getView().isBotTurn).toBe(true);
    expect(session.getView().handoffPlayerId).toBeUndefined();
    session.revealHand();
    expect(session.getView().visiblePlayerId).toBeUndefined();
    expect(session.getView().snapshot!.context.players.every((player) => !player.hand.length)).toBe(
      true,
    );
    expect(
      session
        .getView()
        .snapshot!.context.players.slice(2)
        .every((player) => player.isBot),
    ).toBe(true);
    expect(session.requestHint()).toBeNull();
    vi.advanceTimersByTime(800);
    expect(session.getView().handoffPlayerId).toBe("local-1");
    expect(session.getView().snapshot!.context.cardPile).toEqual([
      [{ suit: "DIAMOND", value: "3" }],
    ]);
    session.revealHand();
    expect(session.getView().snapshot!.context.players[0].hand).toHaveLength(13);
    expect(
      session
        .getView()
        .snapshot!.context.players.slice(1)
        .every((player) => !player.hand.length),
    ).toBe(true);
    session.send({ type: "PASS_TURN", playerId: "local-1" });
    session.revealHand();
    session.send({ type: "PASS_TURN", playerId: "local-2" });
    expect(session.getView().isBotTurn).toBe(true);
    expect(session.getView().snapshot!.context.players.every((player) => !player.hand.length)).toBe(
      true,
    );
    vi.advanceTimersByTime(800);
    expect(session.getView().isBotTurn).toBe(true);
    expect(session.getView().snapshot!.context.cardPile.length).toBeGreaterThan(1);
    vi.advanceTimersByTime(800);
    expect(session.getView().handoffPlayerId).toBe("local-1");
  });

  it("requires handoff readiness after every play/pass, background, restore, and redeal", async () => {
    const storage = memoryStorage();
    const session = createSession("pass-and-play", storage);
    await session.initialize();
    expect(session.getView().handoffPlayerId).toBe("local-4");
    expect(session.getView().snapshot!.context.players.every((player) => !player.hand.length)).toBe(
      true,
    );
    expect(session.requestHint()).toBeNull();
    session.send({
      type: "PLAY_FIRST_MOVE",
      playerId: "local-4",
      cards: [{ suit: "DIAMOND", value: "3" }],
    });
    expect(session.getView().snapshot!.value).toBe("ROUND_FIRST_MOVE");
    session.revealHand();
    expect(session.getView().visiblePlayerId).toBe("local-4");
    session.send({
      type: "PLAY_FIRST_MOVE",
      playerId: "local-4",
      cards: [{ suit: "SPADE", value: "2" }],
    });
    expect(session.getView().visiblePlayerId).toBe("local-4");
    expect(session.getView().snapshot!.context.guardMessage).toBeDefined();
    const first = session.getView().snapshot!;
    session.send(createPlayEvent(first, "local-4", session.requestHint()!)!);
    expect(session.getView().handoffPlayerId).toBe("local-1");
    expect(session.getView().visiblePlayerId).toBeUndefined();
    session.revealHand();
    session.send({ type: "PASS_TURN", playerId: "local-1" });
    expect(session.getView().handoffPlayerId).toBe("local-2");
    session.revealHand();
    session.setActive(false);
    session.setActive(true);
    expect(session.getView().visiblePlayerId).toBeUndefined();
    expect(session.getView().handoffPlayerId).toBe("local-2");
    session.revealHand();
    const beforeRestore = session.getView().snapshot!;
    session.dispose();
    const resumed = createSession("pass-and-play", storage);
    await resumed.initialize();
    expect(resumed.getView().snapshot!.value).toBe(beforeRestore.value);
    expect(resumed.getView().snapshot!.context.cardPile).toEqual(beforeRestore.context.cardPile);
    expect(resumed.getView().handoffPlayerId).toBe("local-2");
    expect(resumed.getView().visiblePlayerId).toBeUndefined();
    resumed.revealHand();
    resumed.reset();
    expect(resumed.getView().visiblePlayerId).toBeUndefined();
    expect(resumed.getView().snapshot!.value).toBe("ROUND_FIRST_MOVE");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not expose unplayed opponent cards through its view or hints", async () => {
    const storage = memoryStorage();
    const session = createSession("pass-and-play", storage);
    await session.initialize();
    session.revealHand();
    const nextSession = createSession("pass-and-play", storage, false);
    await nextSession.initialize(); // waits for the queued initial save
    const privateSnapshot = restoreGame(
      storage.data.get(getStorageKey("pass-and-play"))!,
      "pass-and-play",
    );
    const view = session.getView();
    for (const opponent of privateSnapshot.context.players.filter(
      (player) => player.id !== view.visiblePlayerId,
    )) {
      for (const card of opponent.hand)
        expect(JSON.stringify(view)).not.toContain(JSON.stringify(card));
    }
    expect(session.requestHint()).toEqual([{ suit: "DIAMOND", value: "3" }]);
  });
});

describe("native Jev bot turns", () => {
  it("removes existing Jev confirmations when the next bot falls back", async () => {
    const request = vi
      .fn<JevBotMoveRequester>()
      .mockResolvedValueOnce({ cards: [{ suit: "DIAMOND", value: "3" }], source: "jev" })
      .mockRejectedValue(new Error("Jev unavailable"));
    const session = createSession("solo", undefined, true, undefined, request);
    await session.initialize();
    await vi.advanceTimersByTimeAsync(BOT_THINKING_DELAY_MS);
    expect(session.getView().snapshot!.context.players.some((player) => player.usesJev)).toBe(true);
    session.send({ type: "PASS_TURN", playerId: "local-you" });
    await vi.advanceTimersByTimeAsync(BOT_THINKING_DELAY_MS);
    expect(request).toHaveBeenCalledTimes(2);
    expect(session.getView().snapshot!.context.players.every((player) => !player.usesJev)).toBe(
      true,
    );
  });

  it.each(["fallback", "forced"] as const)(
    "does not mark an unverified %s move as Jev",
    async (source) => {
      const request = vi
        .fn<JevBotMoveRequester>()
        .mockResolvedValue({ cards: [{ suit: "DIAMOND", value: "3" }], source });
      const session = createSession("solo", undefined, true, undefined, request);
      await session.initialize();
      await vi.advanceTimersByTimeAsync(BOT_THINKING_DELAY_MS);
      expect(session.getView().snapshot!.context.players.every((player) => !player.usesJev)).toBe(
        true,
      );
    },
  );

  it.each(["offline", "background", "redeal"])(
    "clears verified Jev badges on %s",
    async (action) => {
      const request = vi
        .fn<JevBotMoveRequester>()
        .mockResolvedValue({ cards: [{ suit: "DIAMOND", value: "3" }], source: "jev" });
      const session = createSession("solo", undefined, true, undefined, request);
      await session.initialize();
      await vi.advanceTimersByTimeAsync(BOT_THINKING_DELAY_MS);
      expect(session.getView().snapshot!.context.players.some((player) => player.usesJev)).toBe(
        true,
      );
      if (action === "offline") {
        session.setOnline(false);
        session.setOnline(true);
      } else if (action === "background") {
        session.setActive(false);
        session.setActive(true);
      } else session.reset();
      expect(session.getView().snapshot!.context.players.every((player) => !player.usesJev)).toBe(
        true,
      );
    },
  );

  it("uses fallback without a request while offline and aborts pending inference when connectivity is lost", async () => {
    const request = vi.fn<JevBotMoveRequester>().mockReturnValue(new Promise(() => {}));
    const session = createSession("solo", undefined, true, undefined, request);
    await session.initialize();
    await vi.advanceTimersByTimeAsync(BOT_THINKING_DELAY_MS);
    session.setOnline(false);
    expect(request.mock.calls[0][1].aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(BOT_THINKING_DELAY_MS);
    expect(request).toHaveBeenCalledOnce();
    expect(session.getView().snapshot!.context.cardPile).toHaveLength(1);
    expect(session.getView().snapshot!.context.players.every((player) => !player.usesJev)).toBe(
      true,
    );
  });

  it.each(["solo", "pass-and-play"] as const)(
    "uses Jev rather than the deterministic opening in %s",
    async (mode) => {
      const config: OfflineGameConfig = {
        players: [
          { name: "Alex", isBot: false },
          { name: "Blair", isBot: false },
          { name: "Eve", isBot: true },
          { name: "May", isBot: true },
        ],
      };
      const request = vi.fn<JevBotMoveRequester>().mockImplementation(async (input) => ({
        cards: getLegalPlays(input).at(-1) ?? null,
        source: "jev",
      }));
      const session = createSession(mode, undefined, true, config, request);
      await session.initialize();
      const before = session.getView();
      expect(before.snapshot!.context.players.every((player) => !player.usesJev)).toBe(true);
      await vi.advanceTimersByTimeAsync(BOT_THINKING_DELAY_MS - 1);
      expect(request).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(request).toHaveBeenCalledOnce();
      expect(request.mock.calls[0][0]).toMatchObject({
        playedHands: [],
        roundMode: null,
        requiredCard: { suit: "DIAMOND", value: "3" },
        opponentHandSizes: [13, 13, 13],
      });
      expect(request.mock.calls[0][0].hand).toHaveLength(13);
      expect(before.snapshot!.context.players.slice(1).every((player) => !player.hand.length)).toBe(
        true,
      );
      const opening = getLegalPlays(request.mock.calls[0][0]).at(-1)!;
      expect(opening.length).toBeGreaterThan(1);
      expect(session.getView().snapshot!.context.cardPile).toEqual([opening]);
      expect(session.getView().thinkingPlayerId).toBeUndefined();
      expect(
        session
          .getView()
          .snapshot!.context.players.find((player) => player.id === before.thinkingPlayerId)!
          .usesJev,
      ).toBe(true);
    },
  );

  it.each(["network", "invalid"])(
    "falls back to a legal deterministic move after a %s failure",
    async (failure) => {
      const request =
        failure === "network"
          ? vi.fn<JevBotMoveRequester>().mockRejectedValue(new Error("offline"))
          : createJevBotClient(vi.fn().mockResolvedValue({ cards: null }));
      const session = createSession("solo", undefined, true, undefined, request);
      await session.initialize();
      await vi.advanceTimersByTimeAsync(BOT_THINKING_DELAY_MS);
      expect(session.getView().snapshot!.context.cardPile).toEqual([
        [{ suit: "DIAMOND", value: "3" }],
      ]);
      expect(session.getView().error).toBeNull();
      expect(session.getView().snapshot!.context.players.every((player) => !player.usesJev)).toBe(
        true,
      );
    },
  );

  it("keeps the thinking indicator until inference finishes and falls back on timeout even if transport ignores abort", async () => {
    let resolve!: (decision: JevBotMoveDecision) => void;
    const request = vi.fn<JevBotMoveRequester>().mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const session = createSession("solo", undefined, true, undefined, request);
    await session.initialize();
    await vi.advanceTimersByTimeAsync(BOT_THINKING_DELAY_MS);
    expect(session.getView().thinkingPlayerId).toBe("local-bot-3");
    await vi.advanceTimersByTimeAsync(JEV_REQUEST_TIMEOUT_MS - 1);
    expect(session.getView().snapshot!.context.cardPile).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(request.mock.calls[0][1].aborted).toBe(true);
    expect(session.getView().snapshot!.context.cardPile).toHaveLength(1);
    const after = session.getView();
    resolve({ cards: [{ suit: "DIAMOND", value: "3" }], source: "jev" });
    await vi.advanceTimersByTimeAsync(0);
    expect(session.getView()).toBe(after);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["resume", "redeal", "dispose"])(
    "cancels pending inference and ignores late results after %s",
    async (action) => {
      let resolve!: (decision: JevBotMoveDecision) => void;
      const request = vi
        .fn<JevBotMoveRequester>()
        .mockReturnValueOnce(
          new Promise((done) => {
            resolve = done;
          }),
        )
        .mockResolvedValue({ cards: [{ suit: "DIAMOND", value: "3" }], source: "jev" });
      const session = createSession("solo", undefined, true, undefined, request);
      await session.initialize();
      await vi.advanceTimersByTimeAsync(BOT_THINKING_DELAY_MS);
      if (action === "resume") {
        session.setActive(false);
        session.setActive(true);
      } else if (action === "redeal") session.reset();
      else session.dispose();
      expect(request.mock.calls[0][1].aborted).toBe(true);
      const after = session.getView();
      resolve({ cards: [{ suit: "DIAMOND", value: "3" }], source: "jev" });
      await vi.advanceTimersByTimeAsync(0);
      expect(session.getView()).toBe(after);
      if (action !== "dispose") {
        await vi.advanceTimersByTimeAsync(BOT_THINKING_DELAY_MS);
        expect(request).toHaveBeenCalledTimes(2);
        expect(session.getView().snapshot!.context.cardPile).toHaveLength(1);
      } else expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each([2, 3, 4])(
    "requests Jev for every bot seat in a complete %i-player pass-and-play game",
    async (seatCount) => {
      const config: OfflineGameConfig = {
        players: Array.from({ length: seatCount }, (_, index) => ({
          name: `Seat ${index + 1}`,
          isBot: index > 0,
        })),
      };
      const request = vi.fn<JevBotMoveRequester>().mockRejectedValue(new Error("offline"));
      const session = createSession("pass-and-play", undefined, true, config, request);
      const botIds = new Set<string>();
      await session.initialize();
      for (let turn = 0; turn < 500 && session.getView().snapshot!.value !== "GAME_END"; turn++) {
        if (session.getView().isBotTurn) {
          const view = session.getView();
          const playerId = view.thinkingPlayerId!;
          botIds.add(playerId);
          const calls = request.mock.calls.length;
          await vi.advanceTimersByTimeAsync(BOT_THINKING_DELAY_MS);
          expect(request).toHaveBeenCalledTimes(calls + 1);
          expect(request.mock.calls[calls][0].hand).toHaveLength(view.handCounts[playerId]);
        } else {
          session.revealHand();
          const view = session.getView();
          const cards = session.requestHint();
          session.send(
            cards
              ? createPlayEvent(view.snapshot!, view.visiblePlayerId!, cards)!
              : { type: "PASS_TURN", playerId: view.visiblePlayerId! },
          );
        }
      }
      expect(botIds.size).toBe(seatCount - 1);
      expect(session.getView().snapshot!.value).toBe("GAME_END");
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});

describe("local persistence", () => {
  it("uses distinct keys for solo and pass-and-play, and resumes bot turns", async () => {
    const storage = memoryStorage();
    const solo = createSession("solo", storage);
    await solo.initialize();
    solo.dispose();
    const pass = createSession("pass-and-play", storage);
    await pass.initialize();
    pass.dispose();
    const resumed = createSession("solo", storage);
    await resumed.initialize();
    expect(storage.data.has(getStorageKey("solo"))).toBe(true);
    expect(storage.data.has(getStorageKey("pass-and-play"))).toBe(true);
    expect(resumed.getView().isBotTurn).toBe(true);
    vi.advanceTimersByTime(800);
    expect(resumed.getView().snapshot!.context.cardPile).toHaveLength(1);
  });

  it("recovers from corrupt storage with a usable new deal and an error", async () => {
    const storage = memoryStorage();
    storage.data.set(getStorageKey("solo"), "{invalid");
    const session = createSession("solo", storage);
    await session.initialize();
    expect(session.getView().ready).toBe(true);
    expect(session.getView().error).toContain("Could not restore");
    expect(session.getView().snapshot!.value).toBe("ROUND_FIRST_MOVE");
    expect(() =>
      restoreGame('{"version":1,"mode":"solo","value":"ROUND_FIRST_MOVE","context":{}}', "solo"),
    ).toThrow();
  });

  it("reports storage write failures without stopping gameplay", async () => {
    const storage = memoryStorage();
    storage.setItem.mockRejectedValue(new Error("disk full"));
    const session = createSession("solo", storage);
    await session.initialize();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(session.getView().error).toContain("Could not save");
    vi.advanceTimersByTime(800);
    expect(session.getView().snapshot!.context.cardPile).toHaveLength(1);
  });

  it("does not start an actor after disposal while loading storage", async () => {
    let resolveRead!: (saved: string | null) => void;
    const session = createSession("solo", {
      getItem: () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
      setItem: vi.fn(async () => {}),
    });
    const loading = session.initialize();
    await Promise.resolve();
    session.dispose();
    resolveRead(null);
    await loading;
    expect(vi.getTimerCount()).toBe(0);
    expect(session.getView().ready).toBe(false);
  });
});
