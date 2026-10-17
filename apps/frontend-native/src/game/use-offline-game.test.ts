import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { request } from "../network/api";
import { BOT_THINKING_DELAY_MS } from "./offline-game-session";
import { useOfflineGame } from "./use-offline-game";
import type { OfflineGameConfig, OfflineMode } from "./game-helpers";
import { createPlayEvent } from "./game-helpers";
import { getLegalPlays, type JevMoveRequest } from "@big-two/game-ai";
import { onlineManager } from "@tanstack/react-query";

vi.mock("../network/api", () => ({ request: vi.fn() }));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: async () => null, setItem: async () => {} },
}));
vi.mock("react-native", () => ({
  AppState: { currentState: "active", addEventListener: () => ({ remove: vi.fn() }) },
}));

let renderer: ReactTestRenderer | undefined;
let game: ReturnType<typeof useOfflineGame>;
function Harness({ mode, config }: { mode: OfflineMode; config?: OfflineGameConfig }) {
  game = useOfflineGame(mode, config);
  return null;
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  onlineManager.setOnline(true);
  vi.spyOn(Math, "random").mockReturnValue(0);
  vi.mocked(request)
    .mockReset()
    .mockImplementation(async (_, options) => {
      const input = options!.json as JevMoveRequest;
      const cards =
        getLegalPlays({
          ...input,
          cardsToBeat: input.roundMode === null ? undefined : input.playedHands.at(-1),
        })[0] ?? null;
      return { cards, source: "jev" };
    });
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it.each([
  { mode: "solo" as const, seatCount: 4 },
  { mode: "pass-and-play" as const, seatCount: 2 },
  { mode: "pass-and-play" as const, seatCount: 3 },
  { mode: "pass-and-play" as const, seatCount: 4 },
])(
  "wires the native $mode hook's $seatCount-seat bots to Jev by default",
  async ({ mode, seatCount }) => {
    const config: OfflineGameConfig = {
      players: Array.from({ length: seatCount }, (_, index) => ({
        name: `Seat ${index + 1}`,
        isBot: index > 0,
      })),
    };
    await act(async () => {
      renderer = create(createElement(Harness, { mode, config }));
    });
    // At a three-seat table this seeded deal opens on a human, before the bots.
    if (!game.isBotTurn) {
      await act(async () => game.revealHand());
      await act(async () =>
        game.send(createPlayEvent(game.snapshot!, game.visiblePlayerId!, game.requestHint()!)!),
      );
    }
    expect(game.isBotTurn).toBe(true);
    const before = game.snapshot!.context.cardPile;
    const botHandSize = game.handCounts[game.thinkingPlayerId!];
    expect(request).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BOT_THINKING_DELAY_MS);
    });
    expect(request).toHaveBeenCalledOnce();
    const [path, options] = vi.mocked(request).mock.calls[0];
    expect(path).toBe("/api/bot/jev/move");
    expect(options).toMatchObject({ method: "POST", signal: expect.any(AbortSignal) });
    expect(options!.json).toMatchObject({ playedHands: before });
    expect((options!.json as JevMoveRequest).hand).toHaveLength(botHandSize);
    const decision = await vi.mocked(request).mock.results[0].value;
    expect(game.snapshot!.context.cardPile).toEqual([...before, decision.cards]);
    expect(game.snapshot!.context.players.some((player) => player.isBot && player.usesJev)).toBe(
      true,
    );
    expect(
      game
        .snapshot!.context.players.filter((player) => player.isBot)
        .every((player) => !player.hand.length),
    ).toBe(true);
    await act(async () => onlineManager.setOnline(false));
    expect(game.snapshot!.context.players.every((player) => !player.usesJev)).toBe(true);
  },
);
