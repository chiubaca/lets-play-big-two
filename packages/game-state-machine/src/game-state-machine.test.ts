import { describe, expect, it } from "vite-plus/test";
import { createActor } from "xstate";
import type { Card } from "@big-two/game-core";
import { bigTwoGameMachine } from "./game-state-machine.ts";
import { gameEventSchema } from "./game-state-machine.schemas.ts";

const threeOfDiamonds: Card = { suit: "DIAMOND", value: "3" };

function createNewGame() {
  return createActor(bigTwoGameMachine).start();
}

function joinPlayers(playerCount: number) {
  const actor = createNewGame();
  for (let index = 0; index < playerCount; index++) {
    actor.send({
      type: "JOIN_GAME",
      playerId: `p${index + 1}`,
      playerName: `Player ${index + 1}`,
    });
  }
  return actor;
}

function startGame(playerCount: number) {
  const actor = joinPlayers(playerCount);
  actor.send({ type: "START_GAME" });
  return actor;
}

describe("Big Two game setup", () => {
  it("starts with an empty waiting room", () => {
    const snapshot = createNewGame().getSnapshot();

    expect(snapshot.value).toBe("WAITING_FOR_PLAYERS");
    expect(snapshot.context).toEqual({
      players: [],
      currentPlayerIndex: 0,
      roundMode: null,
      cardPile: [],
      consecutivePasses: 0,
      winner: undefined,
    });
  });

  it("accepts unique players up to four", () => {
    const actor = joinPlayers(4);
    actor.send({ type: "JOIN_GAME", playerId: "p1", playerName: "Duplicate" });
    actor.send({ type: "JOIN_GAME", playerId: "p5", playerName: "Player 5" });

    expect(actor.getSnapshot().context.players).toHaveLength(4);
    expect(actor.getSnapshot().context.players[0]).toEqual({
      id: "p1",
      name: "Player 1",
      hand: [],
    });
  });

  it("does not start with fewer than two players", () => {
    const actor = joinPlayers(1);
    actor.send({ type: "START_GAME" });

    expect(actor.getSnapshot().value).toBe("WAITING_FOR_PLAYERS");
  });

  it.each([
    [2, [26, 26]],
    [3, [18, 17, 17]],
    [4, [13, 13, 13, 13]],
  ])("deals all cards across %i players", (playerCount, expectedHandSizes) => {
    const snapshot = startGame(playerCount).getSnapshot();

    expect(snapshot.value).toBe("ROUND_FIRST_MOVE");
    expect(snapshot.context.players.map((player) => player.hand.length)).toEqual(expectedHandSizes);
    expect(snapshot.context.players.flatMap((player) => player.hand)).toHaveLength(52);
  });

  it("starts with the player who holds 3 of DIAMOND", () => {
    const snapshot = startGame(4).getSnapshot();
    const holderIndex = snapshot.context.players.findIndex((player) =>
      player.hand.some(
        (card) => card.suit === threeOfDiamonds.suit && card.value === threeOfDiamonds.value,
      ),
    );

    expect(holderIndex).toBeGreaterThanOrEqual(0);
    expect(snapshot.context.currentPlayerIndex).toBe(holderIndex);
  });
});

describe("event schema", () => {
  it.each(["PLAY_FIRST_MOVE", "PLAY_NEW_ROUND_FIRST_MOVE", "PLAY_CARDS"] as const)(
    "requires playerId for %s",
    (type) => {
      expect(gameEventSchema.safeParse({ type, cards: [threeOfDiamonds] }).success).toBe(false);
      expect(
        gameEventSchema.safeParse({ type, playerId: "p1", cards: [threeOfDiamonds] }).success,
      ).toBe(true);
    },
  );

  it("requires a non-empty playerId for PASS_TURN", () => {
    expect(gameEventSchema.safeParse({ type: "PASS_TURN" }).success).toBe(false);
    expect(gameEventSchema.safeParse({ type: "PASS_TURN", playerId: "" }).success).toBe(false);
    expect(gameEventSchema.safeParse({ type: "PASS_TURN", playerId: "p1" }).success).toBe(true);
  });
});

describe("persisted online snapshots", () => {
  it("restores a dealt game and continues through the same machine", () => {
    const originalActor = startGame(3);
    const persistedSnapshot = JSON.parse(
      JSON.stringify(originalActor.getPersistedSnapshot()),
    ) as ReturnType<typeof originalActor.getPersistedSnapshot>;
    const originalSnapshotCopy = structuredClone(persistedSnapshot);
    const restoredActor = createActor(bigTwoGameMachine, { snapshot: persistedSnapshot }).start();
    const restoredContext = restoredActor.getSnapshot().context;
    const currentPlayer = restoredContext.players[restoredContext.currentPlayerIndex];

    restoredActor.send({
      type: "PLAY_FIRST_MOVE",
      playerId: currentPlayer.id,
      cards: [threeOfDiamonds],
    });

    expect(restoredActor.getSnapshot().value).toBe("NEXT_PLAYER_TURN");
    expect(restoredActor.getSnapshot().context.cardPile).toEqual([[threeOfDiamonds]]);
    expect(persistedSnapshot).toEqual(originalSnapshotCopy);
  });
});
