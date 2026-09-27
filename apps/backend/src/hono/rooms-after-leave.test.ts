import { expect, it, vi } from "vite-plus/test";
import { App } from "./app";

let seated = false;
vi.mock("../lib/auth", () => ({
  auth: { api: { getSession: async () => ({ user: { id: "alice" } }) } },
}));
vi.mock("@big-two/data-ops/database", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        innerJoin: () => ({ where: async () => [{ roomId: "ABCDE" }] }),
      }),
    }),
  }),
}));

const env = {
  BIG_TWO_ROOM_DURABLE_OBJECT: {
    getByName: () => ({
      getGameState: async () =>
        JSON.stringify({
          value: "WAITING_FOR_PLAYERS",
          context: { players: seated ? [{ id: "alice" }] : [{ id: "bob" }] },
        }),
    }),
  },
} as unknown as Cloudflare.Env;

it("removes a departed Spectator's room from Your tables but keeps seated Players' rooms", async () => {
  seated = false;
  expect(await (await App.request("/api/rooms", {}, env)).json()).toEqual({ rooms: [] });
  seated = true;
  expect(await (await App.request("/api/rooms", {}, env)).json()).toEqual({
    rooms: [{ roomId: "ABCDE", status: "waiting", playerCount: 1 }],
  });
});
