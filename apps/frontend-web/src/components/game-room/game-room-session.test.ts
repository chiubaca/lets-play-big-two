import { describe, expect, it } from "vite-plus/test";
import type { BigTwoGameMachineSnapshot, Card } from "@big-two/game-state-machine";

import { createPlayEvent, getRequiredCard } from "./game-room-session";

const cards: Card[] = [{ suit: "DIAMOND", value: "3" }];

function gameState(value: BigTwoGameMachineSnapshot["value"]) {
  return {
    value,
    context: { cardPile: [] },
  } as unknown as BigTwoGameMachineSnapshot;
}

describe("game room turn events", () => {
  it.each([
    ["ROUND_FIRST_MOVE", "PLAY_FIRST_MOVE"],
    ["NEXT_PLAYER_TURN", "PLAY_CARDS"],
    ["PLAY_NEW_ROUND", "PLAY_NEW_ROUND_FIRST_MOVE"],
  ] as const)("maps %s to %s with the acting player", (stateValue, eventType) => {
    expect(createPlayEvent(gameState(stateValue), "player-2", cards)).toEqual({
      type: eventType,
      playerId: "player-2",
      cards,
    });
  });

  it("requires 3 of diamonds only for the opening move", () => {
    expect(getRequiredCard(gameState("ROUND_FIRST_MOVE"))).toEqual({
      suit: "DIAMOND",
      value: "3",
    });
    expect(getRequiredCard(gameState("PLAY_NEW_ROUND"))).toBeUndefined();
  });
});
