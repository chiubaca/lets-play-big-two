import { describe, expect, it } from "vite-plus/test";
import { createActor } from "xstate";
import type { Card } from "@big-two/game-core";
import { bigTwoGameMachine } from "./game-state-machine.ts";
import type { BigTwoGameMachineSnapshot, GameContext, Player } from "./game-state-machine.types.ts";

const card = (value: Card["value"], suit: Card["suit"]): Card => ({ value, suit });
const threeOfDiamonds = card("3", "DIAMOND");

type ActiveGameState = "ROUND_FIRST_MOVE" | "NEXT_PLAYER_TURN" | "PLAY_NEW_ROUND" | "GAME_END";

function player(id: string, hand: Card[]): Player {
  return { id, name: `Player ${id.slice(1)}`, hand };
}

function gameContext(overrides: Partial<GameContext> = {}): GameContext {
  return {
    players: [
      player("p1", [threeOfDiamonds, card("4", "CLUB"), card("6", "DIAMOND")]),
      player("p2", [card("3", "CLUB"), card("5", "DIAMOND"), card("5", "CLUB")]),
    ],
    currentPlayerIndex: 0,
    roundMode: null,
    cardPile: [],
    consecutivePasses: 0,
    winner: undefined,
    ...overrides,
  };
}

function createActorAt(value: ActiveGameState, context: GameContext) {
  const seedActor = createActor(bigTwoGameMachine).start();
  const snapshot = {
    ...seedActor.getPersistedSnapshot(),
    value,
    context,
  } as unknown as BigTwoGameMachineSnapshot;
  seedActor.stop();

  return createActor(bigTwoGameMachine, { snapshot }).start();
}

describe("initial round", () => {
  it("rejects a first move from a player whose turn it is not", () => {
    const context = gameContext();
    const originalContext = structuredClone(context);
    const actor = createActorAt("ROUND_FIRST_MOVE", context);

    actor.send({ type: "PLAY_FIRST_MOVE", playerId: "p2", cards: [threeOfDiamonds] });

    expect(actor.getSnapshot().value).toBe("ROUND_FIRST_MOVE");
    expect(actor.getSnapshot().context.guardMessage).toBe("It is not your turn");
    expect(actor.getSnapshot().context.players).toEqual(originalContext.players);
    expect(context).toEqual(originalContext);
  });

  it("requires the first play to include 3 of DIAMOND", () => {
    const actor = createActorAt("ROUND_FIRST_MOVE", gameContext());

    actor.send({
      type: "PLAY_FIRST_MOVE",
      playerId: "p1",
      cards: [card("4", "CLUB")],
    });

    expect(actor.getSnapshot().value).toBe("ROUND_FIRST_MOVE");
    expect(actor.getSnapshot().context.guardMessage).toBe("First move must include 3 of DIAMOND");
  });

  it("rejects cards the current player does not hold", () => {
    const actor = createActorAt("ROUND_FIRST_MOVE", gameContext());

    actor.send({
      type: "PLAY_FIRST_MOVE",
      playerId: "p1",
      cards: [card("3", "SPADE")],
    });

    expect(actor.getSnapshot().context.guardMessage).toBe("Played cards are not in your hand");
    expect(actor.getSnapshot().context.cardPile).toEqual([]);
  });

  it("rejects selecting one physical card more than once", () => {
    const actor = createActorAt("ROUND_FIRST_MOVE", gameContext());

    actor.send({
      type: "PLAY_FIRST_MOVE",
      playerId: "p1",
      cards: [threeOfDiamonds, threeOfDiamonds],
    });

    expect(actor.getSnapshot().context.guardMessage).toBe("Played cards are not in your hand");
    expect(actor.getSnapshot().context.players[0].hand).toHaveLength(3);
  });

  it("rejects an invalid hand even when all cards are owned", () => {
    const actor = createActorAt("ROUND_FIRST_MOVE", gameContext());

    actor.send({
      type: "PLAY_FIRST_MOVE",
      playerId: "p1",
      cards: [threeOfDiamonds, card("4", "CLUB")],
    });

    expect(actor.getSnapshot().context.guardMessage).toBe("invalid hand was played");
  });

  it("plays an owned 3 of DIAMOND and rotates to the next player", () => {
    const context = gameContext();
    const originalContext = structuredClone(context);
    const actor = createActorAt("ROUND_FIRST_MOVE", context);

    actor.send({ type: "PLAY_FIRST_MOVE", playerId: "p1", cards: [threeOfDiamonds] });

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe("NEXT_PLAYER_TURN");
    expect(snapshot.context.currentPlayerIndex).toBe(1);
    expect(snapshot.context.roundMode).toBe("single");
    expect(snapshot.context.cardPile).toEqual([[threeOfDiamonds]]);
    expect(snapshot.context.players[0].hand).toEqual([card("4", "CLUB"), card("6", "DIAMOND")]);
    expect(snapshot.context.guardMessage).toBeUndefined();
    expect(context).toEqual(originalContext);
  });
});

function followingTurnContext(overrides: Partial<GameContext> = {}): GameContext {
  return gameContext({
    players: [
      player("p1", [card("6", "DIAMOND")]),
      player("p2", [
        card("3", "CLUB"),
        card("5", "DIAMOND"),
        card("5", "CLUB"),
        card("7", "SPADE"),
      ]),
    ],
    currentPlayerIndex: 1,
    roundMode: "single",
    cardPile: [[card("4", "DIAMOND")]],
    ...overrides,
  });
}

describe("following turns", () => {
  it("rejects play and pass events from another player", () => {
    const playActor = createActorAt("NEXT_PLAYER_TURN", followingTurnContext());
    playActor.send({
      type: "PLAY_CARDS",
      playerId: "p1",
      cards: [card("7", "SPADE")],
    });

    expect(playActor.getSnapshot().context.currentPlayerIndex).toBe(1);
    expect(playActor.getSnapshot().context.guardMessage).toBe("It is not your turn");

    const passActor = createActorAt("NEXT_PLAYER_TURN", followingTurnContext());
    passActor.send({ type: "PASS_TURN", playerId: "p1" });

    expect(passActor.getSnapshot().context.currentPlayerIndex).toBe(1);
    expect(passActor.getSnapshot().context.consecutivePasses).toBe(0);
    expect(passActor.getSnapshot().context.guardMessage).toBe("It is not your turn");
  });

  it.each([
    ["a card from another hand", [card("2", "SPADE")]],
    ["a duplicate physical card", [card("5", "DIAMOND"), card("5", "DIAMOND")]],
  ])("rejects %s", (_description, cards) => {
    const actor = createActorAt("NEXT_PLAYER_TURN", followingTurnContext());

    actor.send({ type: "PLAY_CARDS", playerId: "p2", cards });

    expect(actor.getSnapshot().context.guardMessage).toBe("Played cards are not in your hand");
    expect(actor.getSnapshot().context.players[1].hand).toHaveLength(4);
  });

  it("reports an invalid hand before attempting comparison", () => {
    const actor = createActorAt("NEXT_PLAYER_TURN", followingTurnContext());

    actor.send({
      type: "PLAY_CARDS",
      playerId: "p2",
      cards: [card("5", "DIAMOND"), card("7", "SPADE")],
    });

    expect(actor.getSnapshot().context.guardMessage).toBe("invalid hand was played");
  });

  it("reports a valid hand of the wrong round mode", () => {
    const actor = createActorAt("NEXT_PLAYER_TURN", followingTurnContext());

    actor.send({
      type: "PLAY_CARDS",
      playerId: "p2",
      cards: [card("5", "DIAMOND"), card("5", "CLUB")],
    });

    expect(actor.getSnapshot().context.guardMessage).toBe("you must play a single card");
  });

  it("reports a hand that is not big enough", () => {
    const actor = createActorAt("NEXT_PLAYER_TURN", followingTurnContext());

    actor.send({ type: "PLAY_CARDS", playerId: "p2", cards: [card("3", "CLUB")] });

    expect(actor.getSnapshot().context.guardMessage).toBe("Not big enough!");
  });

  it("accepts a bigger owned hand and resets consecutive passes", () => {
    const actor = createActorAt(
      "NEXT_PLAYER_TURN",
      followingTurnContext({ consecutivePasses: 1, guardMessage: "old error" }),
    );

    actor.send({ type: "PLAY_CARDS", playerId: "p2", cards: [card("7", "SPADE")] });

    const context = actor.getSnapshot().context;
    expect(context.currentPlayerIndex).toBe(0);
    expect(context.players[1].hand).not.toContainEqual(card("7", "SPADE"));
    expect(context.cardPile).toEqual([[card("4", "DIAMOND")], [card("7", "SPADE")]]);
    expect(context.consecutivePasses).toBe(0);
    expect(context.guardMessage).toBeUndefined();
  });

  it("ends the game when the current player plays their final card", () => {
    const actor = createActorAt(
      "NEXT_PLAYER_TURN",
      followingTurnContext({
        players: [player("p1", [card("3", "CLUB")]), player("p2", [card("2", "SPADE")])],
        cardPile: [[card("A", "SPADE")]],
      }),
    );

    actor.send({ type: "PLAY_CARDS", playerId: "p2", cards: [card("2", "SPADE")] });

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe("GAME_END");
    expect(snapshot.context.winner).toEqual(player("p2", []));
  });
});

function passingContext(playerCount: number): GameContext {
  return gameContext({
    players: Array.from({ length: playerCount }, (_, index) =>
      player(`p${index + 1}`, [card(String(index + 6) as Card["value"], "DIAMOND")]),
    ),
    currentPlayerIndex: 1,
    roundMode: "single",
    cardPile: [[threeOfDiamonds]],
  });
}

describe("passing and new rounds", () => {
  it.each([2, 3, 4])(
    "returns the lead to the last player after all other players pass in a %i-player game",
    (playerCount) => {
      const actor = createActorAt("NEXT_PLAYER_TURN", passingContext(playerCount));

      for (let playerNumber = 2; playerNumber <= playerCount; playerNumber++) {
        actor.send({ type: "PASS_TURN", playerId: `p${playerNumber}` });
      }

      const snapshot = actor.getSnapshot();
      expect(snapshot.value).toBe("PLAY_NEW_ROUND");
      expect(snapshot.context.currentPlayerIndex).toBe(0);
      expect(snapshot.context.consecutivePasses).toBe(0);
      expect(snapshot.context.roundMode).toBeNull();
    },
  );

  it("allows the round winner to lead without 3 of DIAMOND", () => {
    const context = passingContext(2);
    context.players[0] = player("p1", [card("6", "DIAMOND"), card("8", "HEART")]);
    const actor = createActorAt("NEXT_PLAYER_TURN", context);
    actor.send({ type: "PASS_TURN", playerId: "p2" });

    actor.send({
      type: "PLAY_NEW_ROUND_FIRST_MOVE",
      playerId: "p1",
      cards: [card("6", "DIAMOND")],
    });

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe("NEXT_PLAYER_TURN");
    expect(snapshot.context.currentPlayerIndex).toBe(1);
    expect(snapshot.context.roundMode).toBe("single");
  });

  it("enforces player ownership on a new-round lead", () => {
    const actor = createActorAt(
      "PLAY_NEW_ROUND",
      gameContext({
        players: [player("p1", [card("6", "DIAMOND")]), player("p2", [card("7", "CLUB")])],
      }),
    );

    actor.send({
      type: "PLAY_NEW_ROUND_FIRST_MOVE",
      playerId: "p2",
      cards: [card("7", "CLUB")],
    });
    expect(actor.getSnapshot().context.guardMessage).toBe("It is not your turn");

    actor.send({
      type: "PLAY_NEW_ROUND_FIRST_MOVE",
      playerId: "p1",
      cards: [card("7", "CLUB")],
    });
    expect(actor.getSnapshot().context.guardMessage).toBe("Played cards are not in your hand");
  });

  it("detects a win from a new-round first move", () => {
    const actor = createActorAt(
      "PLAY_NEW_ROUND",
      gameContext({
        players: [player("p1", [card("6", "DIAMOND")]), player("p2", [card("7", "CLUB")])],
      }),
    );

    actor.send({
      type: "PLAY_NEW_ROUND_FIRST_MOVE",
      playerId: "p1",
      cards: [card("6", "DIAMOND")],
    });

    expect(actor.getSnapshot().value).toBe("GAME_END");
    expect(actor.getSnapshot().context.winner).toEqual(player("p1", []));
  });
});

describe("reset", () => {
  it("preserves player identities while clearing game state", () => {
    const winner = player("p2", []);
    const actor = createActorAt(
      "GAME_END",
      gameContext({
        roundMode: "single",
        cardPile: [[card("2", "SPADE")]],
        consecutivePasses: 1,
        winner,
        guardMessage: "old error",
      }),
    );

    actor.send({ type: "RESET_GAME" });

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe("WAITING_FOR_PLAYERS");
    expect(snapshot.context.players).toEqual([player("p1", []), player("p2", [])]);
    expect(snapshot.context.currentPlayerIndex).toBe(0);
    expect(snapshot.context.roundMode).toBeNull();
    expect(snapshot.context.cardPile).toEqual([]);
    expect(snapshot.context.consecutivePasses).toBe(0);
    expect(snapshot.context.winner).toBeUndefined();
    expect(snapshot.context.guardMessage).toBeUndefined();
  });
});
