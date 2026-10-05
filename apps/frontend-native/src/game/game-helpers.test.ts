import { describe, expect, it } from "vite-plus/test";
import {
  bigTwoGameMachine,
  type BigTwoGameMachineSnapshot,
  type GameContext,
} from "@big-two/game-state-machine";
import type { Card } from "@big-two/game-core";
import {
  createPlayEvent,
  getLegalHint,
  getLocalSeats,
  getNextReadyPlayerId,
  getVisiblePlayerId,
  orderHand,
  redactSnapshot,
} from "./game-helpers";
import { ensureGameRuntimeCompatibility } from "./native-runtime";

const three: Card = { suit: "DIAMOND", value: "3" };
const four: Card = { suit: "CLUB", value: "4" };

function state(value: BigTwoGameMachineSnapshot["value"], updates: Partial<GameContext> = {}) {
  const players = getLocalSeats("pass-and-play");
  players[0].hand = [four, three];
  players[1].hand = [{ suit: "SPADE", value: "2" }];
  return bigTwoGameMachine.resolveState({
    value,
    context: {
      players,
      currentPlayerIndex: 0,
      cardPile: [],
      roundMode: null,
      consecutivePasses: 0,
      ...updates,
    },
  });
}

describe("native game helpers", () => {
  it.each([
    ["ROUND_FIRST_MOVE", "PLAY_FIRST_MOVE"],
    ["NEXT_PLAYER_TURN", "PLAY_CARDS"],
    ["PLAY_NEW_ROUND", "PLAY_NEW_ROUND_FIRST_MOVE"],
  ] as const)("selects the event for %s", (value, type) => {
    expect(createPlayEvent(state(value), "local-1", [three])).toEqual({
      type,
      playerId: "local-1",
      cards: [three],
    });
  });

  it("does not create plays outside game turns", () => {
    expect(createPlayEvent(state("GAME_END"), "local-1", [three])).toBeUndefined();
  });

  it("hints require 3♦ on opening, beat the pile, and never hint for another player", () => {
    expect(getLegalHint(state("ROUND_FIRST_MOVE"), "local-1")).toEqual([three]);
    expect(getLegalHint(state("ROUND_FIRST_MOVE"), "local-2")).toBeNull();
    expect(
      getLegalHint(
        state("NEXT_PLAYER_TURN", { roundMode: "single", cardPile: [[three]] }),
        "local-1",
      ),
    ).toEqual([four]);
    expect(
      getLegalHint(
        state("NEXT_PLAYER_TURN", {
          roundMode: "single",
          cardPile: [[{ suit: "SPADE", value: "2" }]],
        }),
        "local-1",
      ),
    ).toBeNull();
    expect(getLegalHint(state("GAME_END"), "local-1")).toBeNull();
  });

  it("new-round hints ignore the previous pile", () => {
    expect(
      getLegalHint(
        state("PLAY_NEW_ROUND", { cardPile: [[{ suit: "SPADE", value: "2" }]] }),
        "local-1",
      ),
    ).toEqual([three]);
  });

  it("orders by rank or suit without mutating the hand", () => {
    const hand: Card[] = [
      four,
      { suit: "DIAMOND", value: "2" },
      { suit: "SPADE", value: "3" },
      three,
    ];
    expect(orderHand(hand)).toEqual([three, hand[2], four, hand[1]]);
    expect(orderHand(hand, "suit")).toEqual([three, hand[1], four, hand[2]]);
    expect(hand[0]).toEqual(four);
  });

  it("keeps hands hidden until readiness and invalidates readiness only when a turn changes", () => {
    const first = state("ROUND_FIRST_MOVE");
    expect(getVisiblePlayerId(first, "pass-and-play")).toBeUndefined();
    expect(getVisiblePlayerId(first, "pass-and-play", "local-2")).toBeUndefined();
    expect(getVisiblePlayerId(first, "pass-and-play", "local-1")).toBe("local-1");
    expect(getVisiblePlayerId(first, "pass-and-play", "local-1", false)).toBeUndefined();
    expect(
      getNextReadyPlayerId(
        first,
        state("ROUND_FIRST_MOVE", { guardMessage: "invalid" }),
        "local-1",
      ),
    ).toBe("local-1");
    expect(
      getNextReadyPlayerId(first, state("NEXT_PLAYER_TURN", { currentPlayerIndex: 1 }), "local-1"),
    ).toBeUndefined();
    expect(getNextReadyPlayerId(first, state("GAME_END"), "local-1")).toBeUndefined();
  });

  it("redacts every unplayed opponent hand, including snapshot serialization, without aliasing cards", () => {
    const privateState = state("ROUND_FIRST_MOVE");
    const view = redactSnapshot(privateState, "pass-and-play", "local-1");
    expect(view.context.players[0].hand).toEqual([four, three]);
    expect(view.context.players.slice(1).every((player) => player.hand.length === 0)).toBe(true);
    expect(JSON.stringify(view)).not.toContain(
      JSON.stringify(privateState.context.players[1].hand[0]),
    );
    view.context.players[0].hand[0].value = "A";
    expect(privateState.context.players[0].hand[0].value).toBe("4");
    expect(
      redactSnapshot(privateState, "pass-and-play").context.players.every(
        (player) => !player.hand.length,
      ),
    ).toBe(true);
  });

  it("uses fixed local IDs rather than crypto-generated bot seats", () => {
    expect(getLocalSeats("solo").map((seat) => seat.id)).toEqual([
      "local-you",
      "local-bot-1",
      "local-bot-2",
      "local-bot-3",
    ]);
    expect(getLocalSeats("pass-and-play").map((seat) => seat.id)).toEqual([
      "local-1",
      "local-2",
      "local-3",
      "local-4",
    ]);
  });

  it("provides a non-mutating toSorted fallback on older Hermes", () => {
    const descriptor = Object.getOwnPropertyDescriptor(Array.prototype, "toSorted");
    try {
      Object.defineProperty(Array.prototype, "toSorted", {
        configurable: true,
        writable: true,
        value: undefined,
      });
      ensureGameRuntimeCompatibility();
      const values = [3, 1, 2];
      expect(values.toSorted((a, b) => a - b)).toEqual([1, 2, 3]);
      expect(values).toEqual([3, 1, 2]);
      expect(getLegalHint(state("ROUND_FIRST_MOVE"), "local-1")).toEqual([three]);
    } finally {
      if (descriptor) Object.defineProperty(Array.prototype, "toSorted", descriptor);
    }
  });
});
