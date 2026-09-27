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
  deserializeAttachment: () => { userId: string; sessionId: string };
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}> = [];
let roomExists = true;
let seatName: string | null = "Stored seat name";
let sessionValid = true;
let order = 0;
const state = {
  id: { name: "ABCDE" },
  storage: {
    sql: {
      exec: (sql: string) =>
        sql.includes("RETURNING") ? { one: () => ({ value: ++order }) } : undefined,
    },
    setAlarm: vi.fn(),
  },
  getWebSockets: () => sockets,
  acceptWebSocket: (socket: (typeof sockets)[number]) => sockets.push(socket),
} as unknown as DurableObjectState;
const env = {
  BIG_TWO_DB: {
    prepare: () => ({
      bind: () => ({ first: async () => (sessionValid ? { id: "session" } : null) }),
    }),
  },
  BIG_TWO_ROOM_DURABLE_OBJECT: {
    getByName: () => ({ getChatSeat: async () => (roomExists ? { seatName } : null) }),
  },
} as unknown as Env;
const visitor = { userId: "ada", sessionId: "session" };
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
    author: "Stored seat name",
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

it("checks the current seat on every send, but allows former Players to keep reading", async () => {
  const socket = connect();
  const chat = new RoomChatObject(state, env);
  seatName = null;
  expect((await chat.send(visitor, input)).status).toBe(403);
  seatName = "New seat name";
  expect((await chat.send(visitor, input)).message?.author).toBe("New seat name");
  seatName = null;
  await chat.alarm();
  expect(socket.close).not.toHaveBeenCalled();
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

it("admits seated and unseated visitors with no replay and rejects a missing live room", async () => {
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
    headers: { "X-Chat-User-ID": visitor.userId, "X-Chat-Session-ID": visitor.sessionId },
  });
  const chat = new RoomChatObject(state, env);
  seatName = null;
  expect((await chat.fetch(request)).status).toBe(101);
  expect(sockets[0].send).not.toHaveBeenCalled();
  seatName = "Stored seat name";
  await chat.send(visitor, input);
  expect((await chat.fetch(request)).status).toBe(101);
  expect(sockets[1].send).not.toHaveBeenCalled();
  roomExists = false;
  expect((await chat.fetch(request)).status).toBe(403);
});
