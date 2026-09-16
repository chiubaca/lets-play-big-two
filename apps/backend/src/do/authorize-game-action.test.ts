import { describe, expect, it } from "vite-plus/test";
import type { Card, GameEvent, Player } from "@big-two/game-state-machine";

import { getGameActionAuthorizationError } from "./authorize-game-action";

const players: Player[] = [
  { id: "creator", name: "Creator", hand: [] },
  { id: "guest", name: "Guest", hand: [] },
];
const cards: Card[] = [{ suit: "DIAMOND", value: "3" }];

function authorize(event: GameEvent, requesterId: string) {
  return getGameActionAuthorizationError({ event, players, requesterId });
}

describe("getGameActionAuthorizationError", () => {
  it("allows a player to join only as themselves", () => {
    const event = { type: "JOIN_GAME", playerId: "new-player", playerName: "New" } as const;

    expect(authorize(event, "new-player")).toBeUndefined();
    expect(authorize(event, "someone-else")).toBe("Cannot join as another player");
  });

  it("rejects actions from nonparticipants", () => {
    expect(authorize({ type: "START_GAME" }, "outsider")).toBe(
      "You are not a participant in this room",
    );
  });

  it("rejects attempts to act as another participant", () => {
    expect(authorize({ type: "PLAY_FIRST_MOVE", playerId: "creator", cards }, "guest")).toBe(
      "Cannot act as another player",
    );
  });

  it.each([{ type: "START_GAME" }, { type: "RESET_GAME" }] satisfies GameEvent[])(
    "allows only the creator to send $type",
    (event) => {
      expect(authorize(event, "creator")).toBeUndefined();
      expect(authorize(event, "guest")).toBe("Only the room creator can manage the game");
    },
  );

  it("allows a participant to submit their own turn action", () => {
    expect(
      authorize({ type: "PLAY_FIRST_MOVE", playerId: "guest", cards }, "guest"),
    ).toBeUndefined();
  });
});
