import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { App } from "./app";

let sqlite: Database.Database;
let account = "ada";
let live = true;
let available = true;
const verifyFirstTurn = vi.fn(async () => true);
const setRoomFocus = vi.fn(async () => true);

vi.mock("../lib/auth", () => ({
  auth: {
    api: {
      getSession: async () =>
        live ? { user: { id: account }, session: { id: `${account}-session` } } : null,
    },
  },
}));
vi.mock("@big-two/data-ops/database", () => ({ getDb: () => drizzle(sqlite) }));

function env() {
  return {
    VAPID_PRIVATE_KEY: "secret-only-on-backend",
    BIG_TWO_DB: {
      prepare(sql: string) {
        let values: unknown[] = [];
        return {
          bind(...args: unknown[]) {
            values = args;
            return this;
          },
          first: async () => sqlite.prepare(sql).get(...values) ?? null,
        };
      },
    },
    BIG_TWO_ROOM_DURABLE_OBJECT: {
      getByName: () => ({
        verifyFirstTurn,
        setRoomFocus,
        getChatSeat: async () => ({ seatName: "Ada" }),
      }),
    },
  } as unknown as Cloudflare.Env;
}

const ROOM = "ABCDE";
const TURN = "11111111-1111-4111-8111-111111111111";
const ENDPOINT = "a".repeat(64);
const CHECK = `/api/turn-notifications/check?roomId=${ROOM}&turnId=${TURN}&endpointId=${ENDPOINT}`;

beforeEach(() => {
  account = "ada";
  live = true;
  available = true;
  verifyFirstTurn.mockReset().mockImplementation(async () => available);
  setRoomFocus.mockReset().mockResolvedValue(true);
  sqlite = new Database(":memory:");
  sqlite.exec(`CREATE TABLE accountDeletion(user_id TEXT PRIMARY KEY);
    CREATE TABLE turnNotificationRegistration(endpoint_id TEXT, user_id TEXT, session_id TEXT, generation INTEGER);
    CREATE TABLE room(id TEXT, status TEXT, expires_at INTEGER);
    INSERT INTO turnNotificationRegistration VALUES ('${ENDPOINT}', 'ada','ada-session',0);
    INSERT INTO room VALUES ('ABCDE','playing',NULL);`);
});
afterEach(() => {
  sqlite.close();
  vi.restoreAllMocks();
});

it("authenticates receipt, returns only a neutral same-origin ticket, and fails closed on account or verification changes", async () => {
  const config = env();
  const accepted = (await (await App.request(CHECK, {}, config)).json()) as {
    eligible: boolean;
    target: string;
  };
  expect(accepted.eligible).toBe(true);
  expect(accepted.target).toMatch(/^\/turn-return\?ticket=[A-Za-z0-9_-]+$/);
  expect(accepted.target).not.toContain(ROOM);
  expect(verifyFirstTurn).toHaveBeenCalledWith(ROOM, TURN, "ada", {
    endpoint_id: ENDPOINT,
    session_id: "ada-session",
    generation: 0,
  });
  account = "ben";
  expect(await (await App.request(CHECK, {}, config)).json()).toEqual({ eligible: false });
  account = "ada";
  available = false;
  expect(await (await App.request(CHECK, {}, config)).json()).toEqual({ eligible: false });
  available = true;
  live = false;
  expect(await (await App.request(CHECK, {}, config)).json()).toEqual({ eligible: false });
  live = true;
  sqlite.prepare("DELETE FROM turnNotificationRegistration").run();
  expect(await (await App.request(CHECK, {}, config)).json()).toEqual({ eligible: false });
});

it("resolves an alert's room only for its original account, including after the Turn ends", async () => {
  const config = env();
  const { target } = (await (await App.request(CHECK, {}, config)).json()) as { target: string };
  available = false; // A previously displayed alert remains a route to current room state.
  expect(
    await (
      await App.request(
        `/api/turn-notifications/return${target.slice("/turn-return".length)}`,
        {},
        config,
      )
    ).json(),
  ).toEqual({ allowed: true, target: "/room/ABCDE" });
  account = "ben";
  expect(
    await (
      await App.request(
        `/api/turn-notifications/return${target.slice("/turn-return".length)}`,
        {},
        config,
      )
    ).json(),
  ).toEqual({ allowed: false });
  account = "ada";
  sqlite.prepare("UPDATE room SET status = 'expiring'").run();
  expect(
    await (
      await App.request(
        `/api/turn-notifications/return${target.slice("/turn-return".length)}`,
        {},
        config,
      )
    ).json(),
  ).toEqual({ allowed: true, missing: true });
  expect(
    await (
      await App.request("/api/turn-notifications/return?ticket=//evil.example.com", {}, config)
    ).json(),
  ).toEqual({ allowed: false });
});

it("accepts room focus only through an authenticated, origin-checked and seat-checked API", async () => {
  const config = env();
  const body = JSON.stringify({
    tabId: "11111111-1111-4111-8111-111111111111",
    focused: true,
    sequence: 1,
  });
  const call = (headers: Record<string, string> = { Origin: "https://local.bigtwo.com" }) =>
    App.request(`/api/turn-notifications/focus/${ROOM}`, { method: "POST", headers, body }, config);
  expect((await call()).status).toBe(200);
  expect(setRoomFocus).toHaveBeenCalledWith(
    ROOM,
    "ada",
    "ada-session",
    "11111111-1111-4111-8111-111111111111",
    true,
    1,
  );
  expect((await call({ Origin: "https://evil.example" })).status).toBe(403);
  live = false;
  expect((await call()).status).toBe(401);
  live = true;
  setRoomFocus.mockResolvedValueOnce(false);
  expect((await call()).status).toBe(404);
});
