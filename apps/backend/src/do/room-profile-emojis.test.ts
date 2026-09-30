import { createActor } from "xstate";
import { expect, it, vi } from "vite-plus/test";
import { bigTwoGameMachine, type BigTwoGameMachineSnapshot } from "@big-two/game-state-machine";
import { withRoomProfileEmojis } from "./room-profile-emojis";
import { roomView } from "./room-view";

it("projects current account emojis for existing rooms without exposing hands or changing saved state", async () => {
  const actor = createActor(bigTwoGameMachine).start();
  actor.send({ type: "JOIN_GAME", playerId: "alice", playerName: "Alice" });
  actor.send({ type: "JOIN_GAME", playerId: "bob", playerName: "Bob" });
  actor.send({ type: "START_GAME" });
  const state = actor.getPersistedSnapshot() as BigTwoGameMachineSnapshot;
  const all = vi.fn().mockResolvedValue({
    results: [
      { id: "alice", emoji: "🐲" },
      { id: "bob", emoji: null },
    ],
  });
  const bind = vi.fn(() => ({ all }));
  const prepare = vi.fn(() => ({ bind }));
  const db = { prepare } as unknown as D1Database;
  const projected = await withRoomProfileEmojis(state, db);
  expect(bind).toHaveBeenCalledWith("alice", "bob");
  expect(projected.context.players.map((player) => player.emoji)).toEqual(["🐲", "♠️"]);
  expect(state.context.players[0].emoji).toBeUndefined();
  expect(
    roomView(projected, "spectator", 1).context.players.every((player) => player.hand.length === 0),
  ).toBe(true);
  all.mockResolvedValue({ results: [{ id: "alice", emoji: "🦊" }] });
  expect((await withRoomProfileEmojis(state, db)).context.players[0].emoji).toBe("🦊");
});

it("keeps bot avatars and defaults missing profiles to spades", async () => {
  const actor = createActor(bigTwoGameMachine).start();
  actor.send({ type: "JOIN_GAME", playerId: "alice", playerName: "Alice" });
  actor.send({ type: "FILL_WITH_BOTS" });
  const state = actor.getPersistedSnapshot() as BigTwoGameMachineSnapshot;
  const bind = vi.fn(() => ({ all: async () => ({ results: [] }) }));
  const db = { prepare: () => ({ bind }) } as unknown as D1Database;
  const projected = await withRoomProfileEmojis(state, db);
  expect(bind).toHaveBeenCalledWith("alice");
  expect(projected.context.players[0].emoji).toBe("♠️");
  expect(projected.context.players.slice(1).every((player) => player.emoji === "🤖")).toBe(true);
});
