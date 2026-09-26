import { createActor } from "xstate";
import { expect, test } from "vite-plus/test";
import {
  bigTwoGameMachine,
  type BigTwoGameMachineSnapshot,
  type Player,
} from "@big-two/game-state-machine";
import { roomView } from "./room-view";

test("only the viewer's hand is sent, while all hand counts remain visible", () => {
  const game = createActor(bigTwoGameMachine).start();
  game.send({ type: "JOIN_GAME", playerId: "a", playerName: "Alice" });
  game.send({ type: "JOIN_GAME", playerId: "b", playerName: "Bob" });
  game.send({ type: "START_GAME" });
  const state = game.getPersistedSnapshot() as BigTwoGameMachineSnapshot;

  const spectator = roomView(state, "spectator", 1);
  expect(spectator.context.players.every((player) => player.hand.length === 0)).toBe(true);
  expect(spectator.handCounts).toEqual({ a: 26, b: 26 });
  expect(spectator.spectatorCount).toBe(1);

  const alice = roomView(state, "a", 1);
  expect(alice.context.players[0].hand).toHaveLength(26);
  expect(alice.context.players[1].hand).toHaveLength(0);
  expect(state.context.players[1].hand).toHaveLength(26);
});

test("a winner's hand is also private", () => {
  const game = createActor(bigTwoGameMachine).start();
  game.send({ type: "JOIN_GAME", playerId: "a", playerName: "Alice" });
  const state = game.getPersistedSnapshot() as BigTwoGameMachineSnapshot;
  const winner = {
    id: "a",
    name: "Alice",
    hand: [{ value: "3", suit: "DIAMOND" }],
  } as Player;
  const finished = { ...state, context: { ...state.context, winner } };
  expect(roomView(finished, "spectator", 0).context.winner?.hand).toEqual([]);
});

test("a rejected action's warning is not broadcast to other room viewers", () => {
  const game = createActor(bigTwoGameMachine).start();
  game.send({ type: "JOIN_GAME", playerId: "a", playerName: "Alice" });
  game.send({ type: "JOIN_GAME", playerId: "b", playerName: "Bob" });
  game.send({ type: "START_GAME" });
  const state = game.getPersistedSnapshot() as BigTwoGameMachineSnapshot;
  const currentPlayer = state.context.players[state.context.currentPlayerIndex];
  const otherPlayer = state.context.players.find((player) => player.id !== currentPlayer.id)!;
  game.send({ type: "PLAY_FIRST_MOVE", playerId: otherPlayer.id, cards: [] });
  const rejected = game.getPersistedSnapshot() as BigTwoGameMachineSnapshot;

  expect(rejected.context.guardMessage).toBe("It is not your turn");
  expect(roomView(rejected, currentPlayer.id, 0).context.guardMessage).toBeUndefined();
  expect(roomView(rejected, otherPlayer.id, 0).context.guardMessage).toBeUndefined();
});
