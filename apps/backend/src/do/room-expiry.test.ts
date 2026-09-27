import { createActor } from "xstate";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { bigTwoGameMachine } from "@big-two/game-state-machine";
import { BigTwoRoomObject } from "./big-two-room-do";
import { sweepRooms } from "../lib/room-expiry";

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

const NOW = 1_800_000_000_000;
const TWO_DAYS = 48 * 60 * 60 * 1000;
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
afterEach(() => vi.useRealTimers());

function fixture(phase: "waiting" | "playing" | "finished" = "waiting", legacy = false) {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const row: {
    id: string;
    status: string;
    created_at: number | null;
    expires_at: number | null;
    empty_since: number | null;
    visited: number;
  } = {
    id: "ABCDE",
    status: "waiting",
    created_at: legacy ? null : NOW,
    expires_at: legacy ? null : NOW + TWO_DAYS,
    empty_since: legacy ? null : NOW,
    visited: 0,
  };
  let exists = true;
  let sessionValid = true;
  let chatConnected = false;
  let member = true;
  let messages = true;
  let retired = false;
  let failCleanup = false;
  let state: string | null;
  const actor = createActor(bigTwoGameMachine).start();
  actor.send({ type: "JOIN_GAME", playerId: "ada", playerName: "Ada" });
  if (phase !== "waiting") {
    actor.send({ type: "JOIN_GAME", playerId: "bob", playerName: "Bob" });
    actor.send({ type: "JOIN_GAME", playerId: "cal", playerName: "Cal" });
    actor.send({ type: "JOIN_GAME", playerId: "dan", playerName: "Dan" });
    actor.send({ type: "START_GAME" });
  }
  state = JSON.stringify(actor.getPersistedSnapshot());
  if (phase === "finished") state = JSON.stringify({ ...JSON.parse(state), value: "GAME_END" });
  const sockets: Array<{
    deserializeAttachment: () => unknown;
    serializeAttachment: (attachment: unknown) => void;
    close: ReturnType<typeof vi.fn>;
  }> = [];
  const chat = {
    hasEligibleVisitors: vi.fn(async () => chatConnected && sessionValid),
    removeRoom: vi.fn(async () => {
      if (failCleanup) throw new Error("chat storage unavailable");
      messages = false;
    }),
  };
  const db = {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        first: async () => {
          if (sql.includes("SELECT s.id"))
            return sessionValid && exists && row.status !== "expiring" ? { id: "session" } : null;
          return exists ? { ...row } : null;
        },
        all: async () => ({
          results:
            exists &&
            row.id > (args[0] as string) &&
            (row.status === "expiring" ||
              row.created_at === null ||
              row.expires_at === null ||
              row.expires_at <= (args[1] as number))
              ? [{ id: row.id }]
              : [],
        }),
        run: async () => {
          if (sql.startsWith("UPDATE room SET expires_at = NULL")) {
            row.expires_at = null;
            row.empty_since = null;
            row.visited = 1;
          }
          if (sql.startsWith("UPDATE room SET empty_since = ?")) {
            row.empty_since = args[0] as number;
            row.expires_at = args[1] as number;
          }
          if (sql.startsWith("UPDATE room SET status")) row.status = "expiring";
          if (sql.startsWith("INSERT OR IGNORE INTO retiredRoomCode")) retired = true;
          if (sql.startsWith("DELETE FROM usersToRooms")) member = false;
          if (sql.startsWith("DELETE FROM room")) exists = false;
        },
      }),
    }),
  };
  let object!: BigTwoRoomObject;
  const env = {
    BIG_TWO_DB: db,
    ROOM_CHAT_DURABLE_OBJECT: { getByName: () => chat },
    BIG_TWO_ROOM_DURABLE_OBJECT: { getByName: () => object },
  } as unknown as Env;
  object = new BigTwoRoomObject(
    {
      storage: {
        sql: {
          exec: (sql: string) => ({
            toArray: () =>
              sql.includes("SELECT game_state") && state ? [{ game_state: state }] : [],
          }),
        },
        deleteAll: async () => {
          state = null;
        },
      },
      getWebSockets: () => sockets,
      acceptWebSocket: (socket: (typeof sockets)[number]) => sockets.push(socket),
    } as unknown as DurableObjectState,
    env,
  );
  return {
    row,
    object,
    env,
    sockets,
    chat,
    setChatConnected: (value: boolean) => {
      chatConnected = value;
    },
    setSessionValid: (value: boolean) => {
      sessionValid = value;
    },
    setFailCleanup: (value: boolean) => {
      failCleanup = value;
    },
    setPhase: (value: string) => {
      state = JSON.stringify({ ...JSON.parse(state!), value });
    },
    result: () => ({ exists, member, messages, state, retired }),
  };
}

it("expires a room never opened 48 hours after creation, clearing game, chat and Lobby references", async () => {
  const room = fixture();
  vi.setSystemTime(NOW + TWO_DAYS - 1);
  await sweepRooms(room.env);
  expect(room.result().exists).toBe(true);
  vi.setSystemTime(NOW + TWO_DAYS);
  await sweepRooms(room.env);
  expect(room.result()).toMatchObject({
    exists: false,
    member: false,
    messages: false,
    state: null,
    retired: true,
  });
  expect(await room.object.markConnected("ABCDE", "ada", "session")).toBe(false);
});

it.each(["waiting", "finished", "playing"] as const)(
  "starts a fresh %s-room deadline on the last departure",
  async (phase) => {
    const room = fixture(phase);
    expect(await room.object.markConnected("ABCDE", "ada", "session")).toBe(true);
    expect(room.row.expires_at).toBeNull();
    await room.object.visitorDeparted("ABCDE");
    const duration = phase === "playing" ? SEVEN_DAYS : TWO_DAYS;
    expect(room.row.expires_at).toBe(NOW + duration);
    vi.setSystemTime(NOW + duration - 1);
    expect(await room.object.markConnected("ABCDE", "ada", "session")).toBe(true);
    vi.setSystemTime(NOW + duration + 500);
    await room.object.visitorDeparted("ABCDE");
    expect(room.row.expires_at).toBe(Date.now() + duration);
  },
);

it("keeps a room with only a signed-in Spectator chat connection active", async () => {
  const room = fixture("playing");
  room.setChatConnected(true);
  expect(await room.object.markConnected("ABCDE", "ada", "session")).toBe(true);
  await room.object.visitorDeparted("ABCDE");
  expect(room.row.expires_at).toBeNull();
  room.setChatConnected(false);
  await room.object.visitorDeparted("ABCDE");
  expect(room.row.expires_at).toBe(NOW + SEVEN_DAYS);
  room.setSessionValid(false);
  vi.setSystemTime(NOW + SEVEN_DAYS);
  await sweepRooms(room.env);
  expect(room.result().exists).toBe(false);
});

it("recalculates the deadline from the last departure when a paused game finishes", async () => {
  const room = fixture("playing");
  await room.object.markConnected("ABCDE", "ada", "session");
  await room.object.visitorDeparted("ABCDE");
  expect(room.row.expires_at).toBe(NOW + SEVEN_DAYS);
  vi.setSystemTime(NOW + 60 * 60 * 1000);
  room.setPhase("GAME_END");
  await room.object.visitorDeparted("ABCDE");
  expect(room.row.expires_at).toBe(NOW + TWO_DAYS);
});

it("counts a connected game-room Spectator, then starts the deadline on disconnect", async () => {
  const room = fixture();
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
        attachment: null as unknown,
        serializeAttachment(value: unknown) {
          this.attachment = value;
        },
        deserializeAttachment() {
          return this.attachment;
        },
        close: vi.fn(),
        send: vi.fn(),
      };
    },
  );
  try {
    const response = await room.object.fetch(
      new Request("https://api.example/room", {
        headers: {
          "X-Room-Viewer-ID": "ada",
          "X-Room-Session-ID": "session",
          "X-Room-ID": "ABCDE",
        },
      }),
    );
    expect(response.status).toBe(101);
    await room.object.visitorDeparted("ABCDE");
    expect(room.row.expires_at).toBeNull();
    const socket = room.sockets[0] as unknown as WebSocket;
    await room.object.webSocketClose(socket, 1000, "", true);
    expect(room.row.expires_at).toBe(NOW + TWO_DAYS);
  } finally {
    vi.unstubAllGlobals();
  }
});

it("retries a partial cleanup without ever exposing or reusing the expiring room", async () => {
  const room = fixture();
  room.setFailCleanup(true);
  vi.setSystemTime(NOW + TWO_DAYS);
  await sweepRooms(room.env);
  expect(room.row.status).toBe("expiring");
  expect(room.result()).toMatchObject({ exists: true, messages: true });
  expect(await room.object.markConnected("ABCDE", "ada", "session")).toBe(false);
  room.setFailCleanup(false);
  await sweepRooms(room.env);
  expect(room.result()).toMatchObject({ exists: false, messages: false, state: null });
});

it("does not count an invalidated connection as presence", async () => {
  const room = fixture();
  await room.object.markConnected("ABCDE", "ada", "session");
  room.setSessionValid(false);
  await sweepRooms(room.env);
  expect(room.row.expires_at).toBe(NOW + TWO_DAYS);
});

it("removes legacy rooms immediately on rollout, including unfinished games", async () => {
  const room = fixture("playing", true);
  await sweepRooms(room.env);
  expect(room.result()).toMatchObject({ exists: false, member: false, messages: false });
});
