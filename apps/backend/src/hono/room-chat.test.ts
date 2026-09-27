import { afterEach, expect, it, vi } from "vite-plus/test";
import { App } from "./app";
import { RoomChatObject } from "../do/room-chat-do";
import { BigTwoRoomObject } from "../do/big-two-room-do";
import { roomTable } from "@big-two/data-ops/drizzle/schema";

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

const session = vi.fn();
const send = vi.fn();
const fetchSocket = vi.fn();
const history = vi.fn();
let roomExists = true;
let roomExpired = false;
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
                ? [
                    {
                      id: "ABCDE",
                      status: "waiting",
                      expiresAt: roomExpired ? Date.now() - 1 : null,
                    },
                  ]
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
  ROOM_CHAT_DURABLE_OBJECT: { getByName: () => ({ send, fetch: fetchSocket, history }) },
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
  history.mockReset();
  roomExists = true;
  roomExpired = false;
  deleting = false;
  vi.unstubAllGlobals();
});

it("guards paged history and never caches it publicly", async () => {
  const get = (query = "") => App.request(`/api/room/chat/ABCDE${query}`, {}, env);
  session.mockResolvedValue(null);
  expect((await get()).status).toBe(401);
  session.mockResolvedValue({ user: { id: "ada" }, session: { id: "session-1" } });
  deleting = true;
  expect((await get()).status).toBe(409);
  deleting = false;
  roomExists = false;
  expect((await get()).status).toBe(404);
  roomExists = true;
  expect((await get("?before=0")).status).toBe(400);
  roomExpired = true;
  expect((await get()).status).toBe(404);
  roomExpired = false;
  expect((await get("?before=10&after=11")).status).toBe(400);
  history.mockResolvedValue({ messages: [{ id: "ABCDE:2", order: 2 }], hasMore: false });
  const response = await get("?before=3");
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toMatchObject({ messages: [{ order: 2 }] });
  expect(history).toHaveBeenCalledWith(
    { roomId: "ABCDE", userId: "ada", sessionId: "session-1" },
    3,
    undefined,
  );
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
    { roomId: "ABCDE", userId: "ada", sessionId: "session-1" },
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

it("routes authenticated upgrades and sends through the live chat object across phases and seat changes", async () => {
  session.mockResolvedValue({ user: { id: "ada" }, session: { id: "session-1" } });
  let seat: string | null = "Room seat <Ada>";
  let phase = "WAITING_FOR_PLAYERS";
  let live = true;
  let sequence = 0;
  const sockets: Array<{
    attachment: { roomId: string; userId: string; sessionId: string };
    received: string[];
    deserializeAttachment: () => { roomId: string; userId: string; sessionId: string };
    send: (value: string) => void;
    close: ReturnType<typeof vi.fn>;
  }> = [];
  const state = {
    id: { equals: (id: string) => id === "ABCDE" },
    getWebSockets: () => sockets,
    acceptWebSocket: (socket: (typeof sockets)[number]) => sockets.push(socket),
    storage: {
      sql: {
        exec: (sql: string) =>
          sql.includes("RETURNING")
            ? { one: () => ({ value: ++sequence }) }
            : sql.includes("WHERE user_id = ? AND client_send_id = ?")
              ? { toArray: () => [] }
              : undefined,
      },
      setAlarm: vi.fn(),
      sync: vi.fn(),
    },
  } as unknown as DurableObjectState;
  const gameRoom = new BigTwoRoomObject(
    {
      storage: {
        sql: {
          exec: (query: string) =>
            query.includes("SELECT game_state")
              ? {
                  toArray: () =>
                    live
                      ? [
                          {
                            game_state: JSON.stringify({
                              value: phase,
                              context: {
                                players: seat ? [{ id: "ada", name: seat, hand: [] }] : [],
                              },
                            }),
                          },
                        ]
                      : [],
                }
              : undefined,
        },
      },
    } as unknown as DurableObjectState,
    {
      BIG_TWO_DB: {
        prepare: (sql: string) => ({
          bind: () => ({
            first: async () =>
              sql.includes("SELECT created_at")
                ? { created_at: Date.now(), expires_at: Date.now() + 48 * 60 * 60 * 1000 }
                : { id: "session-1" },
            run: async () => ({}),
          }),
        }),
      },
    } as unknown as Env,
  );
  const liveEnv = {
    ROOM_CHAT_DURABLE_OBJECT: { idFromName: (roomId: string) => roomId },
    BIG_TWO_DB: {
      prepare: () => ({
        bind: () => ({
          first: async () => (roomExists && !deleting ? { name: "Ada account" } : null),
        }),
      }),
    },
    BIG_TWO_ROOM_DURABLE_OBJECT: {
      getByName: () => gameRoom,
    },
  } as unknown as Env;
  const chat = new RoomChatObject(state, liveEnv);
  const routeEnv = {
    ROOM_CHAT_DURABLE_OBJECT: { getByName: () => chat },
  } as unknown as Cloudflare.Env;
  const NativeResponse = Response;
  vi.stubGlobal(
    "Response",
    class extends NativeResponse {
      constructor(body: BodyInit | null, options?: ResponseInit & { webSocket?: unknown }) {
        super(body, options?.status === 101 ? { status: 200 } : options);
        if (options?.status === 101) Object.defineProperty(this, "status", { value: 101 });
      }
    },
  );
  vi.stubGlobal(
    "WebSocketPair",
    class {
      0 = {};
      1 = {
        attachment: { roomId: "", userId: "", sessionId: "" },
        received: [] as string[],
        serializeAttachment(value: { roomId: string; userId: string; sessionId: string }) {
          this.attachment = value;
        },
        deserializeAttachment() {
          return this.attachment;
        },
        send(value: string) {
          this.received.push(value);
        },
        close: vi.fn(),
      };
    },
  );

  const upgrade = () =>
    App.request("/api/room/chat/ws/ABCDE", { headers: { Upgrade: "websocket" } }, routeEnv);
  expect((await upgrade()).status).toBe(101);
  expect((await upgrade()).status).toBe(101);
  expect(sockets).toHaveLength(2);
  expect(sockets[1].received).toEqual([]); // A late tab gets no replay.

  const sendLive = (text: string) =>
    App.request(
      "/api/room/chat/ABCDE",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, clientSendId: crypto.randomUUID() }),
      },
      routeEnv,
    );
  for (phase of ["WAITING_FOR_PLAYERS", "NEXT_PLAYER_TURN", "GAME_END"]) {
    const reply = await sendLive(phase);
    expect(reply.status).toBe(200);
    const acknowledgement = await reply.json();
    expect(acknowledgement).toMatchObject({
      order: sequence,
      author: "Ada account",
      role: "Player",
      text: phase,
    });
    expect(JSON.parse(sockets[0].received.at(-1)!)).toEqual(acknowledgement);
    expect(JSON.parse(sockets[1].received.at(-1)!)).toEqual(acknowledgement);
  }
  seat = null;
  expect((await sendLive("not seated")).status).toBe(200);
  expect((await upgrade()).status).toBe(101); // Former Player remains a Spectator.
  live = false;
  expect((await upgrade()).status).toBe(403);
  expect((await sendLive("no live room")).status).toBe(403);
  await chat.alarm();
  expect(sockets[0].close).toHaveBeenCalled();
  live = true;
  roomExists = false;
  expect((await upgrade()).status).toBe(404);
  expect((await sendLive("removed")).status).toBe(404);
});
