import { describe, it, expect } from "vitest";
import { makeBigTwoGameMachine } from "./gameStateMachine.ts";
import { createActor } from "xstate";
import type { Card } from "@big-two/game-core";

import { PLAYER_ABOUT_TO_WIN } from "./mocks/PLAYER_ABOUT_TO_WIN.ts";

describe("Big Two Game State Machine", () => {
  // Helper function to create a fresh game instance
  const createNewGame = () => {
    const machine = makeBigTwoGameMachine();
    return createActor(machine).start();
  };

  describe("Initial State", () => {
    it("should start in WAITING_FOR_PLAYERS state", () => {
      const gameActor = createNewGame();
      expect(gameActor.getSnapshot().value).toBe("WAITING_FOR_PLAYERS");
    });

    it("should have empty initial context", () => {
      const gameActor = createNewGame();
      const context = gameActor.getSnapshot().context;

      expect(context).toEqual({
        players: [],
        currentPlayerIndex: 0,
        roundMode: null,
        cardPile: [],
        consecutivePasses: 0,
        winner: undefined,
      });
    });
  });

  describe("Player Management", () => {
    it("should allow adding players", () => {
      const gameActor = createNewGame();

      gameActor.send({
        type: "JOIN_GAME",
        playerId: "player1",
        playerName: "Alice",
      });

      const context = gameActor.getSnapshot().context;
      expect(context.players).toHaveLength(1);
      expect(context.players[0]).toEqual({
        id: "player1",
        name: "Alice",
        hand: [],
      });
    });

    it("should not allow more than 4 players", () => {
      const gameActor = createNewGame();

      // Add 4 players
      for (let i = 1; i <= 4; i++) {
        gameActor.send({
          type: "JOIN_GAME",
          playerId: `player${i}`,
          playerName: `Player ${i}`,
        });
      }

      // Try to add a 5th player
      gameActor.send({
        type: "JOIN_GAME",
        playerId: "player5",
        playerName: "Player 5",
      });

      const context = gameActor.getSnapshot().context;
      expect(context.players).toHaveLength(4);
    });
  });

  describe("Game Flow", () => {
    it("should not start game with less than 2 players", () => {
      const gameActor = createNewGame();

      // Add only 1 player
      gameActor.send({
        type: "JOIN_GAME",
        playerId: "player1",
        playerName: "Player 1",
      });

      gameActor.send({ type: "START_GAME" });

      const snapshot = gameActor.getSnapshot();
      expect(snapshot.value).toBe("WAITING_FOR_PLAYERS");
    });

    it("should transition to ROUND_FIRST_MOVE when game starts", () => {
      const gameActor = createNewGame();

      // Add 4 players
      for (let i = 1; i <= 4; i++) {
        gameActor.send({
          type: "JOIN_GAME",
          playerId: `player${i}`,
          playerName: `Player ${i}`,
        });
      }

      gameActor.send({ type: "START_GAME" });

      const snapshot = gameActor.getSnapshot();
      expect(snapshot.value).toBe("ROUND_FIRST_MOVE");
      expect(snapshot.context.players.every((p) => p.hand.length > 0)).toBe(true);
    });

    it("should handle player turns correctly", () => {
      const gameActor = createNewGame();

      // Add 2 players for simplicity
      for (let i = 1; i <= 2; i++) {
        gameActor.send({
          type: "JOIN_GAME",
          playerId: `player${i}`,
          playerName: `Player ${i}`,
        });
      }

      gameActor.send({ type: "START_GAME" });

      // Play first move with a single card
      const sampleCard: Card = { suit: "HEART", value: "3" };
      gameActor.send({
        type: "PLAY_FIRST_MOVE",
        cards: [sampleCard],
      });

      const snapshot = gameActor.getSnapshot();
      expect(snapshot.value).toBe("NEXT_PLAYER_TURN");
      expect(snapshot.context.currentPlayerIndex).toBe(1); // Should move to next player
      expect(snapshot.context.roundMode).toBe("single");
    });
  });

  describe("Game Reset", () => {
    it("should reset game state correctly", () => {
      const gameActor = createNewGame();

      // Setup some game state
      gameActor.send({
        type: "JOIN_GAME",
        playerId: "player1",
        playerName: "Alice",
      });

      gameActor.send({ type: "RESET_GAME" });

      const context = gameActor.getSnapshot().context;
      expect(context).toEqual({
        players: [{ id: "player1", name: "Alice", hand: [] }],
        currentPlayerIndex: 0,
        roundMode: null,
        cardPile: [],
        consecutivePasses: 0,
        winner: undefined,
      });
    });
  });

  describe("Game end", () => {
    it("will end once a player has played all their cards", () => {
      const bigTwoGameMachine = makeBigTwoGameMachine();

      const gameActor = createActor(bigTwoGameMachine, {
        snapshot: PLAYER_ABOUT_TO_WIN,
      }).start();

      gameActor.send({
        type: "PLAY_CARDS",
        cards: [{ suit: "SPADE", value: "2" }],
      });
      const state = gameActor.getSnapshot();
      expect(state.value).toEqual("GAME_END");
      expect(state.context.winner?.name).toEqual("test2");
    });
  });
});
