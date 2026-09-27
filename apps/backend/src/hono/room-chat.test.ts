import { afterEach, expect, it, vi } from "vite-plus/test";
import { App } from "./app";
import { roomTable } from "@big-two/data-ops/drizzle/schema";

const session = vi.fn();
const send = vi.fn();
const fetchSocket = vi.fn();
let roomExists = true;
let deleting = false;

vi.mock("../lib/auth", () => ({
  auth: { api: { getSession: (...args: unknown[]) => session(...args) } },
}));
vi.mock("@big-two/data-ops/database", () => ({
  getDb: () => ({
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: async () =>
            table === roomTable
              ? roomExists
                ? [{ id: "ABCDE" }]
                : []
              : deleting
                ? [{ userId: "ada" }]
                : [],
        }),
      }),
    }),
  }),
}));

const env = {
  ROOM_CHAT_DURABLE_OBJECT: { getByName: () => ({ send, fetch: fetchSocket }) },
} as unknown as Cloudflare.Env;
const clientSendId = "123e4567-e89b-12d3-a456-426614174000";
const post = (value: unknown) =>
  App.request(
    "/api/room/chat/ABCDE",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    },
    env,
  );

afterEach(() => {
  session.mockReset();
  send.mockReset();
  fetchSocket.mockReset();
  roomExists = true;
  deleting = false;
});

it("rejects signed-out, deleting, and removed-room sends before forwarding to chat", async () => {
  session.mockResolvedValue(null);
  expect((await post({ text: "hello", clientSendId })).status).toBe(401);
  session.mockResolvedValue({ user: { id: "ada" }, session: { id: "session-1" } });
  deleting = true;
  expect((await post({ text: "hello", clientSendId })).status).toBe(409);
  deleting = false;
  roomExists = false;
  expect((await post({ text: "hello", clientSendId })).status).toBe(404);
  expect(send).not.toHaveBeenCalled();
});

it("accepts trimmed plain text and passes only authenticated identity to chat", async () => {
  session.mockResolvedValue({ user: { id: "ada" }, session: { id: "session-1" } });
  const message = {
    type: "message",
    id: "ABCDE:1",
    order: 1,
    clientSendId,
    author: "Seat name",
    text: "hi",
  };
  send.mockResolvedValue({ message });
  const response = await post({ text: "  hi  ", clientSendId });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(message);
  expect(send).toHaveBeenCalledWith(
    { userId: "ada", sessionId: "session-1" },
    { text: "hi", clientSendId },
  );
});

it("rejects malformed, over-limit, and control text without sending", async () => {
  session.mockResolvedValue({ user: { id: "ada" }, session: { id: "session-1" } });
  const invalid = ["   ", "a".repeat(201), "one\ntwo\nthree\nfour", "hi\tthere", "x".repeat(8193)];
  for (const text of invalid) {
    const response = await post({ text, clientSendId });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await response.text(), `input length ${text.length}`).toContain("error");
  }
  expect((await post({ text: 1, clientSendId })).status).toBe(400);
  expect((await post({ text: "hi", clientSendId, author: "forged" })).status).toBe(400);
  expect(send).not.toHaveBeenCalled();
});

it("rejects unauthenticated upgrades without touching the chat object", async () => {
  session.mockResolvedValue(null);
  const response = await App.request(
    "/api/room/chat/ws/ABCDE",
    { headers: { Upgrade: "websocket" } },
    env,
  );
  expect(response.status).toBe(401);
  expect(fetchSocket).not.toHaveBeenCalled();
});

it("accepts the three-line and Unicode-grapheme boundaries without rewriting literal content", async () => {
  session.mockResolvedValue({ user: { id: "ada" }, session: { id: "session-1" } });
  send.mockImplementation(async (_visitor, input) => ({
    message: {
      type: "message",
      id: "ABCDE:1",
      order: 1,
      author: "<Seat>",
      ...input,
    },
  }));
  const exact = "e\u0301".repeat(199) + "👩‍👩‍👧‍👦";
  const response = await post({ text: `  ${exact}  `, clientSendId });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ text: exact });
  expect(
    (await post({ text: "<b>Hi</b>\n**literal**\nhttps://example.com", clientSendId })).status,
  ).toBe(200);
  expect((await post({ text: "👩‍👩‍👧‍👦".repeat(201), clientSendId })).status).toBe(400);
  expect((await post({ text: "a\nb\nc\nd", clientSendId })).status).toBe(400);
});

it("rejects other origins and invalid JSON with actionable errors", async () => {
  session.mockResolvedValue({ user: { id: "ada" }, session: { id: "session-1" } });
  const foreign = await App.request(
    "/api/room/chat/ABCDE",
    {
      method: "POST",
      headers: { Origin: "https://foreign.example", "Content-Type": "application/json" },
      body: JSON.stringify({ text: "hi", clientSendId }),
    },
    env,
  );
  expect(foreign.status).toBe(403);
  const malformed = await App.request(
    "/api/room/chat/ABCDE",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{bad",
    },
    env,
  );
  expect(malformed.status).toBe(400);
  expect(await malformed.json()).toMatchObject({ error: expect.stringContaining("JSON") });
});
