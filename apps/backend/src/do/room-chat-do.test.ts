import { afterEach, expect, it, vi } from "vite-plus/test";

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

import { RoomChatObject } from "./room-chat-do";

const sockets: Array<{
  deserializeAttachment: () => { roomId: string; userId: string; sessionId: string };
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}> = [];
let roomExists = true;
let seatName: string | null = "Stored seat name";
let sessionValid = true;
let order = 0;
const stored: Array<{
  order_id: number;
  user_id: string | null;
  client_send_id: string;
  author: string;
  role: "Player" | "Spectator" | null;
  text: string;
}> = [];
const state = {
  id: { equals: (id: string) => id === "ABCDE" },
  storage: {
    sql: {
      exec: (sql: string, ...args: unknown[]) => {
        if (sql.includes("RETURNING")) return { one: () => ({ value: ++order }) };
        if (sql.includes("INSERT INTO chat_messages")) {
          stored.push({
            order_id: args[0] as number,
            user_id: args[1] as string,
            client_send_id: args[2] as string,
            author: args[3] as string,
            role: args[4] as "Player" | "Spectator",
            text: args[5] as string,
          });
        }
        if (sql.includes("SELECT order_id, client_send_id, author")) {
          const after = sql.includes("order_id >");
          const rows = stored.filter((row) =>
            after ? row.order_id > (args[0] as number) : row.order_id < (args[0] as number),
          );
          return { toArray: () => (after ? rows : rows.reverse()).slice(0, 51) };
        }
        if (sql.includes("WHERE user_id = ? AND client_send_id = ?")) {
          return {
            toArray: () =>
              stored.filter((row) => row.user_id === args[0] && row.client_send_id === args[1]),
          };
        }
        if (sql.includes("SELECT order_id, client_send_id FROM"))
          return { toArray: () => stored.filter((row) => row.user_id === args[0]) };
        if (sql.includes("UPDATE chat_messages"))
          for (const row of stored.filter((row) => row.user_id === args[0])) {
            row.user_id = null;
            row.author = "Deleted participant";
            row.role = null;
            row.text = "Message removed";
          }
        return undefined;
      },
    },
    setAlarm: vi.fn(),
    sync: vi.fn(),
  },
  getWebSockets: () => sockets,
  acceptWebSocket: (socket: (typeof sockets)[number]) => sockets.push(socket),
} as unknown as DurableObjectState;
const env = {
  ROOM_CHAT_DURABLE_OBJECT: { idFromName: (roomId: string) => roomId },
  BIG_TWO_DB: {
    prepare: () => ({
      bind: () => ({ first: async () => (sessionValid ? { name: "Ada account" } : null) }),
    }),
  },
  BIG_TWO_ROOM_DURABLE_OBJECT: {
    getByName: () => ({ getChatSeat: async () => (roomExists ? { seatName } : null) }),
  },
} as unknown as Env;
const visitor = { roomId: "ABCDE", userId: "ada", sessionId: "session" };
const input = { text: "literal <b>text</b>", clientSendId: "send-1" };

function connect(userId = "ada") {
  const socket = {
    deserializeAttachment: () => ({ ...visitor, userId }),
    send: vi.fn(),
    close: vi.fn(),
  };
  sockets.push(socket);
  return socket;
}

afterEach(() => {
  sockets.length = 0;
  roomExists = true;
  sessionValid = true;
  seatName = "Stored seat name";
  order = 0;
  stored.length = 0;
  vi.unstubAllGlobals();
});

it("fans out ordered accepted messages to every eligible tab with matching acknowledgement and echo", async () => {
  const first = connect();
  const second = connect();
  const chat = new RoomChatObject(state, env);
  const one = await chat.send(visitor, input);
  const two = await chat.send(visitor, { ...input, clientSendId: "send-2" });
  expect(one.message).toMatchObject({
    id: "ABCDE:1",
    order: 1,
    author: "Ada account",
    role: "Player",
    text: input.text,
    clientSendId: "send-1",
  });
  expect(two.message).toMatchObject({ id: "ABCDE:2", order: 2 });
  expect(first.send.mock.calls.map(([payload]) => JSON.parse(payload))).toEqual([
    one.message,
    two.message,
  ]);
  expect(second.send.mock.calls.map(([payload]) => JSON.parse(payload))).toEqual([
    one.message,
    two.message,
  ]);
});

it("snapshots the current role and lets Spectators send without taking a seat", async () => {
  const socket = connect();
  const chat = new RoomChatObject(state, env);
  seatName = null;
  expect((await chat.send(visitor, input)).message).toMatchObject({
    author: "Ada account",
    role: "Spectator",
  });
  seatName = "New seat name";
  expect((await chat.send(visitor, { ...input, clientSendId: "send-2" })).message).toMatchObject({
    author: "Ada account",
    role: "Player",
  });
  seatName = null;
  await chat.alarm();
  expect(socket.close).not.toHaveBeenCalled();
  expect((await chat.history(visitor))?.messages.map((entry) => entry.role)).toEqual([
    "Player",
    "Spectator",
  ]);
});

it("revokes invalid sessions and removed rooms before subsequent delivery", async () => {
  const socket = connect();
  const chat = new RoomChatObject(state, env);
  sessionValid = false;
  expect((await chat.send(visitor, input)).status).toBe(403);
  await chat.alarm();
  expect(socket.close).toHaveBeenCalled();
  sessionValid = true;
  roomExists = false;
  expect((await chat.send(visitor, input)).status).toBe(403);
});

it("rejects a visitor claiming a different room, including on a stored socket", async () => {
  const socket = connect();
  const chat = new RoomChatObject(state, env);
  const wrongRoom = { ...visitor, roomId: "OTHER" };
  expect((await chat.send(wrongRoom, input)).status).toBe(403);
  expect(socket.send).not.toHaveBeenCalled();
  sockets.push({
    deserializeAttachment: () => wrongRoom,
    send: vi.fn(),
    close: vi.fn(),
  });
  await chat.alarm();
  expect(sockets[1].close).toHaveBeenCalledWith(1008, "Room chat access ended");
});

it("does not deliver to a tab whose account or session has become ineligible", async () => {
  const current = connect();
  const stale = connect("revoked");
  const chat = new RoomChatObject(state, {
    ...env,
    BIG_TWO_DB: {
      prepare: () => ({
        bind: (_room: string, _session: string, user: string) => ({
          first: async () => (user === "revoked" ? null : { id: "session" }),
        }),
      }),
    },
  } as unknown as Env);
  await chat.send(visitor, input);
  expect(current.send).toHaveBeenCalledOnce();
  expect(stale.send).not.toHaveBeenCalled();
  expect(stale.close).toHaveBeenCalled();
});

it("confirms acceptance even if a connected socket fails during fan-out", async () => {
  const broken = connect();
  broken.send.mockImplementation(() => {
    throw new Error("disconnected");
  });
  const other = connect();
  const accepted = await new RoomChatObject(state, env).send(visitor, input);
  expect(accepted.message?.id).toBe("ABCDE:1");
  expect(other.send).toHaveBeenCalledOnce();
});

it("admits seated and unseated visitors, returns bounded history and rejects a missing live room", async () => {
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
        attachment: visitor,
        serializeAttachment(value: typeof visitor) {
          this.attachment = value;
        },
        deserializeAttachment() {
          return this.attachment;
        },
        send: vi.fn(),
        close: vi.fn(),
      };
    },
  );
  const request = new Request("https://api.example.com/chat", {
    headers: {
      "X-Chat-User-ID": visitor.userId,
      "X-Chat-Session-ID": visitor.sessionId,
      "X-Chat-Room-ID": visitor.roomId,
    },
  });
  const chat = new RoomChatObject(state, env);
  seatName = null;
  expect((await chat.fetch(request)).status).toBe(101);
  expect(sockets[0].send).not.toHaveBeenCalled();
  seatName = "Stored seat name";
  await chat.send(visitor, input);
  expect((await chat.history(visitor))?.messages).toMatchObject([
    { text: input.text, role: "Player" },
  ]);
  expect((await chat.fetch(request)).status).toBe(101);
  expect(sockets[1].send).not.toHaveBeenCalled();
  roomExists = false;
  expect((await chat.fetch(request)).status).toBe(403);
  roomExists = true;
  const mismatched = new Request("https://api.example.com/chat", {
    headers: {
      "X-Chat-User-ID": visitor.userId,
      "X-Chat-Session-ID": visitor.sessionId,
      "X-Chat-Room-ID": "OTHER",
    },
  });
  expect((await chat.fetch(mismatched)).status).toBe(403);
});

it("redacts stored and connected messages without removing their positions", async () => {
  const socket = connect();
  const chat = new RoomChatObject(state, env);
  await chat.send(visitor, input);
  socket.send.mockClear();
  await chat.redactAuthor(visitor.userId);
  expect((await chat.history(visitor))?.messages).toMatchObject([
    { order: 1, author: "Deleted participant", text: "Message removed", role: null },
  ]);
  expect(JSON.parse(socket.send.mock.calls[0][0])).toMatchObject({ type: "redaction", order: 1 });
  expect(stored[0].user_id).toBeNull();
});

it("paginates a long history without gaps while new sends arrive", async () => {
  const chat = new RoomChatObject(state, env);
  for (let index = 1; index <= 105; index++) {
    await chat.send(visitor, { text: `message ${index}`, clientSendId: `send-${index}` });
  }
  const newest = await chat.history(visitor);
  expect(newest?.messages.map((item) => item.order)).toEqual(
    Array.from({ length: 50 }, (_, index) => 105 - index),
  );
  expect(newest?.hasMore).toBe(true);
  await chat.send(visitor, { text: "new live message", clientSendId: "send-106" });
  const older = await chat.history(visitor, 56);
  const oldest = await chat.history(visitor, 6);
  expect(
    [...newest!.messages, ...older!.messages, ...oldest!.messages]
      .map((message) => message.order)
      .sort((a, b) => a - b),
  ).toEqual(Array.from({ length: 105 }, (_, index) => index + 1));
  expect(oldest?.hasMore).toBe(false);
  expect((await chat.history(visitor, undefined, 105))?.messages).toMatchObject([
    { order: 106, text: "new live message" },
  ]);
});

it("never confirms a send when durable storage fails", async () => {
  const socket = connect();
  const brokenState = {
    ...state,
    storage: {
      ...state.storage,
      sync: vi.fn().mockRejectedValue(new Error("storage unavailable")),
    },
  };
  await expect(
    new RoomChatObject(brokenState as unknown as DurableObjectState, env).send(visitor, input),
  ).rejects.toThrow("storage unavailable");
  expect(socket.send).not.toHaveBeenCalled();
});

it("returns the original acknowledgement for an uncertain retry without another broadcast", async () => {
  const socket = connect();
  const chat = new RoomChatObject(state, env);
  const first = await chat.send(visitor, input);
  seatName = null;
  const retry = await chat.send(visitor, input);
  expect(retry).toEqual(first);
  expect(socket.send).toHaveBeenCalledOnce();
  expect((await chat.history(visitor))?.messages).toHaveLength(1);
  expect((await chat.send(visitor, { ...input, text: "changed" })).status).toBe(409);
});
