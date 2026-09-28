import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { App } from "./app";

let sqlite: Database.Database;
let account = "ada";
let sessionId = "ada-session";
let live = true;
let available = true;
const verifyTurn = vi.fn(async () => true);
const setRoomFocus = vi.fn(async () => true);

vi.mock("../lib/auth", () => ({
  auth: {
    api: {
      getSession: async () => (live ? { user: { id: account }, session: { id: sessionId } } : null),
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
        verifyTurn,
        setRoomFocus,
        getChatSeat: async () => ({ seatName: "Ada" }),
      }),
    },
  } as unknown as Cloudflare.Env;
}

const ROOM = "ABCDE";
const TURN = "11111111-1111-4111-8111-111111111111";
const ENDPOINT = "a".repeat(64);
const ENROLLMENT = "e".repeat(32);
const CHECK = `/api/turn-notifications/check?roomId=${ROOM}&turnId=${TURN}&endpointId=${ENDPOINT}`;

beforeEach(() => {
  account = "ada";
  sessionId = "ada-session";
  live = true;
  available = true;
  verifyTurn.mockReset().mockImplementation(async () => available);
  setRoomFocus.mockReset().mockResolvedValue(true);
  sqlite = new Database(":memory:");
  sqlite.exec(`CREATE TABLE accountDeletion(user_id TEXT PRIMARY KEY);
    CREATE TABLE user(id TEXT PRIMARY KEY);
    CREATE TABLE session(id TEXT PRIMARY KEY, user_id TEXT, expires_at INTEGER);
    CREATE TABLE turnNotificationPreference(user_id TEXT, enabled INTEGER, generation INTEGER);
    CREATE TABLE turnNotificationRegistration(endpoint_id TEXT, endpoint TEXT, p256dh TEXT, auth TEXT, user_id TEXT, session_id TEXT, generation INTEGER, enrollment_id TEXT);
    CREATE TABLE room(id TEXT, status TEXT, expires_at INTEGER);
    INSERT INTO user VALUES ('ada');
    INSERT INTO session VALUES ('ada-session', 'ada', 9999999999999);
    INSERT INTO turnNotificationPreference VALUES ('ada', 1, 0);
    INSERT INTO turnNotificationRegistration VALUES ('${ENDPOINT}', 'https://fcm.googleapis.com/fcm/send/test', 'key', 'auth', 'ada','ada-session',0,'${ENROLLMENT}');
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
  expect(verifyTurn).toHaveBeenCalledWith(ROOM, TURN, "ada", {
    endpoint_id: ENDPOINT,
    session_id: "ada-session",
    generation: 0,
    enrollment_id: ENROLLMENT,
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

it("denies receipt if enrollment is revoked while a ticket is being minted", async () => {
  verifyTurn.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  expect(await (await App.request(CHECK, {}, env())).json()).toEqual({ eligible: false });
  expect(verifyTurn).toHaveBeenCalledTimes(2);
});

it("resolves an alert's room only for its original account, including after the Turn ends", async () => {
  const config = env();
  const { target } = (await (await App.request(CHECK, {}, config)).json()) as { target: string };
  available = false; // A previously displayed alert remains a route to current room state.
  sqlite.prepare("UPDATE room SET status = 'finished'").run();
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
  sqlite.prepare("DELETE FROM room").run();
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

it("lets the original Player return after signing in on another live session, without reviving a revoked enrollment", async () => {
  const config = env();
  const { target } = (await (await App.request(CHECK, {}, config)).json()) as { target: string };
  const tap = () =>
    App.request(`/api/turn-notifications/return${target.slice("/turn-return".length)}`, {}, config);
  sessionId = "ada-new-session";
  expect(await (await tap()).json()).toEqual({ allowed: true, target: "/room/ABCDE" });
  sqlite.prepare("DELETE FROM turnNotificationRegistration").run();
  expect(await (await tap()).json()).toEqual({ allowed: false });
});

it("denies a previously displayed alert after device removal, re-enrollment, consent reset, expiry or deletion", async () => {
  const config = env();
  const { target } = (await (await App.request(CHECK, {}, config)).json()) as { target: string };
  const tap = () =>
    App.request(`/api/turn-notifications/return${target.slice("/turn-return".length)}`, {}, config);
  expect(await (await tap()).json()).toEqual({ allowed: true, target: "/room/ABCDE" });

  sqlite.prepare("DELETE FROM turnNotificationRegistration").run();
  expect(await (await tap()).json()).toEqual({ allowed: false });
  sqlite
    .prepare(
      "INSERT INTO turnNotificationRegistration VALUES (?, 'https://fcm.googleapis.com/fcm/send/test', 'key', 'auth', 'ada', 'ada-session', 0, ?)",
    )
    .run(ENDPOINT, "f".repeat(32));
  expect(await (await tap()).json()).toEqual({ allowed: false });
  sqlite.prepare("UPDATE turnNotificationRegistration SET enrollment_id = ?").run(ENROLLMENT);

  sqlite.prepare("UPDATE turnNotificationPreference SET enabled = 0, generation = 1").run();
  expect(await (await tap()).json()).toEqual({ allowed: false });
  sqlite.prepare("UPDATE turnNotificationPreference SET enabled = 1").run();
  expect(await (await tap()).json()).toEqual({ allowed: false });

  sqlite.prepare("UPDATE turnNotificationPreference SET generation = 0").run();
  sqlite.prepare("UPDATE session SET expires_at = 0").run();
  expect(await (await tap()).json()).toEqual({ allowed: false });
  sqlite.prepare("UPDATE session SET expires_at = 9999999999999").run();
  sqlite.prepare("INSERT INTO accountDeletion VALUES ('ada')").run();
  expect(await (await tap()).json()).toEqual({ allowed: false });
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
