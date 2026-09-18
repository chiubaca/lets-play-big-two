// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { chooseBotMove } from "@big-two/game-ai";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { useOfflineGame } from "./use-offline-game";
import { createPlayEvent, getCardsToBeat, getRequiredCard } from "./game-room-session";
import { requestJevBotMove } from "./jev-bot-client";

vi.mock("./jev-bot-client", () => ({ requestJevBotMove: vi.fn() }));

const requestJevBotMoveMock = vi.mocked(requestJevBotMove);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("pass-and-play turns", () => {
  it("requires readiness on the first turn, after plays and passes, and after a rematch", () => {
    const { result } = renderHook(() => useOfflineGame());
    act(() =>
      result.current.start([
        { id: "a", name: "Alex" },
        { id: "b", name: "Blair" },
      ]),
    );
    expect(result.current.gameState?.context.players).toHaveLength(2);
    expect(result.current.readyPlayerId).toBeUndefined();
    const state = result.current.gameState!;
    const first = state.context.players[state.context.currentPlayerIndex];
    act(() => result.current.ready());
    expect(result.current.readyPlayerId).toBe(first.id);

    // An illegal opening must not hide the hand or advance the turn.
    act(() => result.current.send({ type: "PASS_TURN", playerId: first.id }));
    expect(result.current.readyPlayerId).toBe(first.id);
    const opening = createPlayEvent(state, first.id, [{ suit: "DIAMOND", value: "3" }])!;
    act(() => result.current.send(opening));
    expect(result.current.readyPlayerId).toBeUndefined();
    const next =
      result.current.gameState!.context.players[
        result.current.gameState!.context.currentPlayerIndex
      ];
    expect(next.id).not.toBe(first.id);
    act(() => result.current.ready());
    expect(result.current.readyPlayerId).toBe(next.id);
    act(() => result.current.send({ type: "PASS_TURN", playerId: next.id }));
    expect(result.current.readyPlayerId).toBeUndefined();
    act(() => result.current.ready());
    act(() => result.current.send({ type: "RESET_GAME" }));
    expect(result.current.readyPlayerId).toBeUndefined();
    expect(result.current.gameState?.value).toBe("ROUND_FIRST_MOVE");
    expect(result.current.gameState?.context.players.map((player) => player.name)).toEqual([
      "Alex",
      "Blair",
    ]);
  });

  it("automates only AI seats and stops at a human handoff", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useOfflineGame());
    act(() =>
      result.current.start([
        { id: "a", name: "Alex" },
        { id: "b", name: "Blair" },
        { id: "bot", name: "AI", isBot: true },
      ]),
    );
    // Advance human turns until the AI takes a turn, regardless of who was dealt 3♦.
    for (let turn = 0; turn < 3 && !result.current.isBotTurn; turn++) {
      const state = result.current.gameState!;
      const player = state.context.players[state.context.currentPlayerIndex];
      act(() => result.current.ready());
      act(() =>
        result.current.send(
          state.value === "ROUND_FIRST_MOVE"
            ? createPlayEvent(state, player.id, [{ suit: "DIAMOND", value: "3" }])!
            : { type: "PASS_TURN", playerId: player.id },
        ),
      );
    }
    expect(result.current.isBotTurn).toBe(true);
    act(() => result.current.ready());
    expect(result.current.readyPlayerId).toBeUndefined();
    act(() => {
      vi.advanceTimersByTime(650);
    });
    expect(result.current.isBotTurn).toBe(false);
    expect(result.current.readyPlayerId).toBeUndefined();
    const state = result.current.gameState;
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.gameState).toBe(state);
  });

  it("uses the Jev move service only for a Jev strategy seat", async () => {
    vi.useFakeTimers();
    requestJevBotMoveMock.mockImplementation(async (state, playerId) => {
      const player = state.context.players.find((entry) => entry.id === playerId)!;
      return {
        cards: chooseBotMove({
          hand: player.hand,
          roundMode: state.context.roundMode,
          cardsToBeat: getCardsToBeat(state),
          requiredCard: getRequiredCard(state),
        }),
        source: "jev",
        confidence: 0.84,
        model: "jev-test",
        trace: {
          selectedAction: "play_1",
          questions: {
            best_play: {
              choice: "play_1",
              confidence: 0.84,
              probabilities: { play_1: 1 },
              options: { play_1: "test move" },
            },
          },
        },
      };
    });
    const { result } = renderHook(() => useOfflineGame());
    act(() =>
      result.current.start([
        { id: "basic-1", name: "Basic 1", isBot: true },
        { id: "jev", name: "Jev", isBot: true, botStrategy: "basic" },
        { id: "basic-2", name: "Basic 2", isBot: true },
        { id: "basic-3", name: "Basic 3", isBot: true },
      ]),
    );
    act(() => result.current.setBotStrategy("jev", "jev"));

    for (let turn = 0; turn < 4; turn += 1) {
      const state = result.current.gameState!;
      const current = state.context.players[state.context.currentPlayerIndex];
      if (current.id === "jev") break;
      await act(async () => vi.advanceTimersByTimeAsync(650));
    }

    const jevTurn = result.current.gameState!;
    expect(jevTurn.context.players[jevTurn.context.currentPlayerIndex].id).toBe("jev");
    await act(async () => vi.advanceTimersByTimeAsync(650));

    expect(requestJevBotMoveMock).toHaveBeenCalledOnce();
    expect(requestJevBotMoveMock).toHaveBeenCalledWith(jevTurn, "jev");
    expect(result.current.jevDecisionLog).toMatchObject([
      {
        sequence: 1,
        playerId: "jev",
        playerName: "Jev",
        decision: { source: "jev", confidence: 0.84, model: "jev-test" },
      },
    ]);
    expect(result.current.jevFallbackPlayerIds.size).toBe(0);
  });

  it("marks a Jev seat when the service falls back to the basic bot", async () => {
    vi.useFakeTimers();
    requestJevBotMoveMock.mockImplementation(async (state, playerId) => {
      const player = state.context.players.find((entry) => entry.id === playerId)!;
      return {
        cards: chooseBotMove({
          hand: player.hand,
          roundMode: state.context.roundMode,
          cardsToBeat: getCardsToBeat(state),
          requiredCard: getRequiredCard(state),
        }),
        source: "fallback",
      };
    });
    const { result } = renderHook(() => useOfflineGame());
    act(() =>
      result.current.start([
        { id: "basic-1", name: "Basic 1", isBot: true },
        { id: "jev", name: "Jev", isBot: true, botStrategy: "jev" },
        { id: "basic-2", name: "Basic 2", isBot: true },
        { id: "basic-3", name: "Basic 3", isBot: true },
      ]),
    );

    for (let turn = 0; turn < 4; turn += 1) {
      const state = result.current.gameState!;
      const current = state.context.players[state.context.currentPlayerIndex];
      if (current.id === "jev") break;
      await act(async () => vi.advanceTimersByTimeAsync(650));
    }
    await act(async () => vi.advanceTimersByTimeAsync(650));

    expect(result.current.jevFallbackPlayerIds.has("jev")).toBe(true);
    expect(result.current.jevDecisionLog[0]?.decision.source).toBe("fallback");
  });
});

describe("solo bot settings", () => {
  it("updates the strategy for an AI seat only", () => {
    const { result } = renderHook(() => useOfflineGame());
    act(() =>
      result.current.start([
        { id: "human", name: "Human" },
        { id: "bot", name: "Bot", isBot: true, botStrategy: "basic" },
      ]),
    );

    expect(result.current.botPlayers).toEqual([
      { id: "bot", name: "Bot", isBot: true, botStrategy: "basic" },
    ]);

    act(() => result.current.setBotStrategy("bot", "jev"));
    expect(result.current.botPlayers[0]?.botStrategy).toBe("jev");

    act(() => result.current.setBotStrategy("human", "jev"));
    expect(result.current.botPlayers).toHaveLength(1);
  });
});
