import { describe, expect, it } from "vite-plus/test";
import { createActor } from "xstate";

import { bigTwoGameMachine, type BigTwoGameMachineSnapshot } from "@big-two/game-state-machine";
import { redactPlayerIdentity } from "./redact-player-identity";

function gameStateWithPlayers(): BigTwoGameMachineSnapshot {
  const actor = createActor(bigTwoGameMachine).start();
  actor.send({ type: "JOIN_GAME", playerId: "player-1", playerName: "Alice" });
  actor.send({ type: "JOIN_GAME", playerId: "player-2", playerName: "Bob" });
  const gameState = actor.getPersistedSnapshot() as BigTwoGameMachineSnapshot;

  return {
    ...gameState,
    context: {
      ...gameState.context,
      winner: gameState.context.players[0],
    },
  };
}

describe("redactPlayerIdentity", () => {
  it("replaces a player's persisted identity without changing their game state", () => {
    const gameState = gameStateWithPlayers();
    const originalPlayer = gameState.context.players[0];
    const redacted = redactPlayerIdentity(gameState, "player-1", "deleted-1");

    expect(redacted?.context.players[0]).toEqual({
      ...originalPlayer,
      id: "deleted-1",
      name: "Deleted player",
    });
    expect(redacted?.context.players[1]).toBe(gameState.context.players[1]);
    expect(redacted?.context.winner).toEqual({
      ...originalPlayer,
      id: "deleted-1",
      name: "Deleted player",
    });
    expect(gameState.context.players[0]).toBe(originalPlayer);
  });

  it("returns null when the player is not in the persisted game", () => {
    expect(redactPlayerIdentity(gameStateWithPlayers(), "unknown", "deleted-1")).toBeNull();
  });
});
