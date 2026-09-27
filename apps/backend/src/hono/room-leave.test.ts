import { afterEach, expect, it, vi } from "vite-plus/test";
import { App } from "./app";

const getSession = vi.fn();
const gameAction = vi.fn();

vi.mock("../lib/auth", () => ({
  auth: { api: { getSession: (...args: unknown[]) => getSession(...args) } },
}));

const env = {
  BIG_TWO_ROOM_DURABLE_OBJECT: {
    idFromName: (roomId: string) => roomId,
    get: () => ({ gameAction }),
  },
} as unknown as Cloudflare.Env;

const leave = (playerId: string) =>
  App.request(
    "/api/room/action/ABCDE",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "LEAVE_GAME", playerId }),
    },
    env,
  );

afterEach(() => {
  getSession.mockReset();
  gameAction.mockReset();
});

it("accepts a seated Player's leave action but never forwards someone else's identity", async () => {
  getSession.mockResolvedValue({ user: { id: "alice" } });
  gameAction.mockResolvedValue({ success: true });

  expect((await leave("bob")).status).toBe(403);
  expect(gameAction).not.toHaveBeenCalled();
  expect((await leave("alice")).status).toBe(200);
  expect(gameAction).toHaveBeenCalledWith({ type: "LEAVE_GAME", playerId: "alice" }, "alice");
});

it("rejects unauthenticated leave requests", async () => {
  getSession.mockResolvedValue(null);
  expect((await leave("alice")).status).toBe(401);
  expect(gameAction).not.toHaveBeenCalled();
});
