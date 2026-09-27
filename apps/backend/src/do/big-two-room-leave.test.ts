import { createActor } from "xstate";
import { expect, it, vi } from "vite-plus/test";
import { bigTwoGameMachine } from "@big-two/game-state-machine";
import { BigTwoRoomObject } from "./big-two-room-do";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    ctx: unknown;
    env: unknown;
    constructor(ctx: unknown, env: unknown) {
      this.ctx = ctx;
      this.env = env;
    }
  },
}));

function room(playing: boolean) {
  const actor = createActor(bigTwoGameMachine).start();
  actor.send({ type: "JOIN_GAME", playerId: "alice", playerName: "Alice" });
  actor.send({ type: "JOIN_GAME", playerId: "bob", playerName: "Bob" });
  if (playing) actor.send({ type: "START_GAME" });
  let stored = JSON.stringify(actor.getPersistedSnapshot());
  const revoked = new Set<string>();
  const received = { alice: vi.fn(), bob: vi.fn() };
  const sockets = Object.entries(received).map(([id, send]) => ({
    deserializeAttachment: () => ({ roomId: "ABCDE", userId: id, sessionId: `session-${id}` }),
    send,
    close: vi.fn(),
  }));
  const sql = {
    exec: (query: string, value?: string) => {
      if (query.startsWith("UPDATE")) stored = value!;
      return { toArray: () => (query.startsWith("SELECT") ? [{ game_state: stored }] : []) };
    },
  };
  const object = new BigTwoRoomObject(
    { storage: { sql }, getWebSockets: () => sockets } as unknown as DurableObjectState,
    {
      BIG_TWO_DB: {
        prepare: () => ({
          bind: (_room: string, _deadline: number, _session: string, userId: string) => ({
            first: async () => (revoked.has(userId) ? null : { id: "valid" }),
          }),
        }),
      },
    } as unknown as Env,
  );
  return { object, received, sockets, revoked };
}

it.each([true, false])(
  "broadcasts a %s departure only to others and transfers the Host",
  async (playing) => {
    const { object, received } = room(playing);
    expect(await object.gameAction({ type: "LEAVE_GAME", playerId: "alice" }, "alice")).toEqual({
      success: true,
    });
    const bob = await object.getRoomView("bob");
    expect(bob?.value).toBe("WAITING_FOR_PLAYERS");
    expect(bob?.context.players.map((player) => player.id)).toEqual(["bob"]);
    expect(await object.gameAction({ type: "RESET_GAME" }, "bob")).toEqual({ success: true });
    expect(JSON.parse(received.bob.mock.calls[0][0]).roomNotice).toBe(
      playing ? "Alice left the table, so the game was reset." : "Alice left the table.",
    );
    expect(JSON.parse(received.alice.mock.calls[0][0]).roomNotice).toBeUndefined();
    expect((await object.getRoomView("alice"))?.context.players).toHaveLength(1);
    expect((await object.getRoomView("bob"))?.roomNotice).toBeUndefined();
    expect(await object.gameAction({ type: "LEAVE_GAME", playerId: "alice" }, "alice")).toEqual({
      success: false,
      error: "You are not a participant in this room",
    });
  },
);

it("confirms a persisted departure even when a disconnected viewer cannot receive the notice", async () => {
  const { object, received } = room(true);
  received.bob.mockImplementation(() => {
    throw new Error("disconnected");
  });

  expect(await object.gameAction({ type: "LEAVE_GAME", playerId: "alice" }, "alice")).toEqual({
    success: true,
  });
  expect((await object.getRoomView("bob"))?.context.players.map((player) => player.id)).toEqual([
    "bob",
  ]);
});

it("closes a revoked game socket before another Player's action is broadcast", async () => {
  const { object, sockets, received, revoked } = room(false);
  revoked.add("alice");
  expect(await object.gameAction({ type: "LEAVE_GAME", playerId: "bob" }, "bob")).toEqual({
    success: true,
  });
  expect(received.alice).not.toHaveBeenCalled();
  expect(sockets[0].close).toHaveBeenCalledWith(1008, "Room access ended");
});
