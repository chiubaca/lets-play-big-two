import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { App } from "./app";
import { revokeTurnsForDeletion } from "../lib/turn-deletion";

let sqlite: Database.Database;
let user = "ada";
let sessionId = "ada-1";
const getSession = vi.fn();
const authHandler = vi.fn(async () => new Response("ok"));

vi.mock("../lib/auth", () => ({
  auth: {
    api: { getSession: (...args: unknown[]) => getSession(...args) },
    handler: () => authHandler(),
  },
}));
vi.mock("@big-two/data-ops/database", () => ({ getDb: () => drizzle(sqlite) }));

const env = {
  BIG_TWO_DB: {
    prepare(sql: string) {
      let params: unknown[] = [];
      return {
        bind(...values: unknown[]) {
          params = values;
          return this;
        },
        async first() {
          return sqlite.prepare(sql).get(...params) ?? null;
        },
        run() {
          sqlite.prepare(sql).run(...params);
        },
      };
    },
    batch(statements: { run: () => void }[]) {
      return Promise.resolve(
        sqlite.transaction(() => statements.map((statement) => statement.run()))(),
      );
    },
  },
} as unknown as Cloudflare.Env;

const endpoint = "https://fcm.googleapis.com/fcm/send/device-token";
const payload = (generation = 0, url = endpoint) =>
  JSON.stringify({
    endpoint: url,
    generation,
    keys: {
      p256dh: Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 1)]).toString("base64url"),
      auth: Buffer.alloc(16, 2).toString("base64url"),
    },
  });

function request(path: string, method = "GET", body?: string) {
  return App.request(
    path,
    {
      method,
      headers: { Origin: "https://local.bigtwo.com", "Content-Type": "application/json" },
      body,
    },
    env,
  );
}
async function deviceId() {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint)),
  );
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function signIn(id: string, session: string) {
  user = id;
  sessionId = session;
  getSession.mockImplementation(() =>
    Promise.resolve({ user: { id: user }, session: { id: sessionId } }),
  );
}

beforeEach(() => {
  sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`CREATE TABLE user (id text PRIMARY KEY);
    CREATE TABLE session (id text PRIMARY KEY, user_id text NOT NULL REFERENCES user(id), expires_at integer NOT NULL);
    CREATE TABLE accountDeletion (user_id text PRIMARY KEY);
    CREATE TABLE turnNotificationPreference (user_id text PRIMARY KEY REFERENCES user(id), enabled integer NOT NULL DEFAULT 0, generation integer NOT NULL DEFAULT 0);
    CREATE TABLE turnNotificationRegistration (endpoint_id text PRIMARY KEY, endpoint text NOT NULL, p256dh text NOT NULL, auth text NOT NULL, user_id text NOT NULL REFERENCES user(id), session_id text NOT NULL REFERENCES session(id) ON DELETE CASCADE, generation integer NOT NULL, enrollment_id text NOT NULL DEFAULT 'enrolled');`);
  sqlite.prepare("INSERT INTO user (id) VALUES (?), (?)").run("ada", "ben");
  for (const [id, owner] of [
    ["ada-1", "ada"],
    ["ada-2", "ada"],
    ["ben-1", "ben"],
  ])
    sqlite
      .prepare("INSERT INTO session (id,user_id,expires_at) VALUES (?,?,?)")
      .run(id, owner, Date.now() + 60_000);
  signIn("ada", "ada-1");
});
afterEach(() => {
  getSession.mockReset();
  authHandler.mockClear();
  sqlite.close();
});

it("rejects a ninth install rather than silently omitting an enrolled install from Turns", async () => {
  expect(
    (await request("/api/turn-notifications/preference", "PUT", '{"enabled":true}')).status,
  ).toBe(200);
  for (let index = 0; index < 8; index++) {
    const response = await request(
      "/api/turn-notifications/device",
      "POST",
      payload(0, `https://fcm.googleapis.com/fcm/send/device-${index}`),
    );
    expect(response.status).toBe(200);
  }
  const ninth = await request(
    "/api/turn-notifications/device",
    "POST",
    payload(0, "https://fcm.googleapis.com/fcm/send/device-8"),
  );
  expect(ninth.status).toBe(409);
  expect(((await ninth.json()) as { error: string }).error).toContain("limit 8");
  expect(
    (
      sqlite.prepare("SELECT count(*) AS count FROM turnNotificationRegistration").get() as {
        count: number;
      }
    ).count,
  ).toBe(8);
  expect(
    (
      await request(
        "/api/turn-notifications/device",
        "POST",
        payload(0, "https://fcm.googleapis.com/fcm/send/device-0"),
      )
    ).status,
  ).toBe(200);
});

it("enrolls only with live account consent and reports registration without secrets", async () => {
  expect((await request("/api/turn-notifications/device", "POST", payload())).status).toBe(409);
  expect(
    (await request("/api/turn-notifications/preference", "PUT", '{"enabled":true}')).status,
  ).toBe(200);
  const enrolled = await request("/api/turn-notifications/device", "POST", payload());
  expect(enrolled.status).toBe(200);
  expect(await enrolled.json()).toEqual({ registered: true });
  expect(
    await (await request(`/api/turn-notifications/device?endpointId=${await deviceId()}`)).json(),
  ).toEqual({ registered: true, generation: 0 });
  signIn("ada", "ada-2");
  expect(
    await (await request(`/api/turn-notifications/device?endpointId=${await deviceId()}`)).json(),
  ).toEqual({ registered: false, generation: 0 });
  expect((await request("/api/turn-notifications/device", "POST", payload())).status).toBe(409);
  signIn("ben", "ben-1");
  await request("/api/turn-notifications/preference", "PUT", '{"enabled":true}');
  expect((await request("/api/turn-notifications/device", "POST", payload())).status).toBe(409);
  await request(
    "/api/turn-notifications/device",
    "DELETE",
    JSON.stringify({ endpointId: await deviceId() }),
  );
  expect(
    sqlite.prepare("SELECT count(*) AS count FROM turnNotificationRegistration").get(),
  ).toEqual({ count: 1 });
  signIn("ada", "ada-1");
  sqlite.prepare("DELETE FROM session WHERE id = ?").run("ada-1");
  expect(
    sqlite.prepare("SELECT count(*) AS count FROM turnNotificationRegistration").get(),
  ).toEqual({ count: 0 });
});

it("removes one install; switching off invalidates the generation and all old registrations", async () => {
  await request("/api/turn-notifications/preference", "PUT", '{"enabled":true}');
  expect((await request("/api/turn-notifications/device", "POST", payload())).status).toBe(200);
  const firstId = sqlite
    .prepare("SELECT enrollment_id FROM turnNotificationRegistration WHERE endpoint_id = ?")
    .get(await deviceId());
  const other = "https://fcm.googleapis.com/fcm/send/other";
  expect((await request("/api/turn-notifications/device", "POST", payload(0, other))).status).toBe(
    200,
  );
  await request(
    "/api/turn-notifications/device",
    "DELETE",
    JSON.stringify({ endpointId: await deviceId() }),
  );
  expect((await request("/api/turn-notifications/device", "POST", payload())).status).toBe(200);
  expect(
    sqlite
      .prepare("SELECT enrollment_id FROM turnNotificationRegistration WHERE endpoint_id = ?")
      .get(await deviceId()),
  ).not.toEqual(firstId);
  await request(
    "/api/turn-notifications/device",
    "DELETE",
    JSON.stringify({ endpointId: await deviceId() }),
  );
  expect(
    sqlite.prepare("SELECT count(*) AS count FROM turnNotificationRegistration").get(),
  ).toEqual({ count: 1 });
  await request("/api/turn-notifications/preference", "PUT", '{"enabled":false}');
  await request("/api/turn-notifications/preference", "PUT", '{"enabled":true}');
  expect(
    sqlite.prepare("SELECT count(*) AS count FROM turnNotificationRegistration").get(),
  ).toEqual({ count: 0 });
  expect((await request("/api/turn-notifications/device", "POST", payload(0))).status).toBe(409);
  expect(await (await request("/api/turn-notifications/device")).json()).toEqual({
    registered: false,
    generation: 1,
  });
});

it("rejects bad endpoints, oversized input, expired sessions, deleting accounts and anonymous requests", async () => {
  await request("/api/turn-notifications/preference", "PUT", '{"enabled":true}');
  for (const url of [
    "https://example.com/x",
    "http://fcm.googleapis.com/fcm/send/x",
    "https://fcm.googleapis.com.evil.test/fcm/send/x",
  ])
    expect((await request("/api/turn-notifications/device", "POST", payload(0, url))).status).toBe(
      400,
    );
  expect(
    (
      await request(
        "/api/turn-notifications/device",
        "POST",
        JSON.stringify({ endpoint, generation: 0, keys: { p256dh: "bad", auth: "bad" } }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await request(
        "/api/turn-notifications/device",
        "POST",
        payload(0, endpoint) + " ".repeat(5000),
      )
    ).status,
  ).toBe(413);
  sqlite.prepare("UPDATE session SET expires_at = 0 WHERE id = ?").run("ada-1");
  expect((await request("/api/turn-notifications/device", "POST", payload())).status).toBe(409);
  sqlite.prepare("INSERT INTO accountDeletion (user_id) VALUES (?)").run("ada");
  expect((await request("/api/turn-notifications/device", "POST", payload())).status).toBe(409);
  getSession.mockResolvedValue(null);
  expect((await request("/api/turn-notifications/device", "POST", payload())).status).toBe(401);
});

it("rolls back consent-off if its registration cleanup fails", async () => {
  await request("/api/turn-notifications/preference", "PUT", '{"enabled":true}');
  await request("/api/turn-notifications/device", "POST", payload());
  sqlite.exec(`CREATE TRIGGER prevent_registration_delete BEFORE DELETE ON turnNotificationRegistration
    BEGIN SELECT RAISE(ABORT, 'cleanup unavailable'); END;`);
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const response = await request("/api/turn-notifications/preference", "PUT", '{"enabled":false}');
  log.mockRestore();
  expect(response.status).toBe(500);
  expect(
    sqlite
      .prepare("SELECT enabled, generation FROM turnNotificationPreference WHERE user_id = ?")
      .get("ada"),
  ).toEqual({ enabled: 1, generation: 0 });
  expect(
    sqlite.prepare("SELECT count(*) AS count FROM turnNotificationRegistration").get(),
  ).toEqual({ count: 1 });
});

it("allows an explicit re-enrollment for the same account after the originating session expires", async () => {
  await request("/api/turn-notifications/preference", "PUT", '{"enabled":true}');
  await request("/api/turn-notifications/device", "POST", payload());
  sqlite.prepare("UPDATE session SET expires_at = 0 WHERE id = ?").run("ada-1");
  signIn("ada", "ada-2");
  expect((await request("/api/turn-notifications/device", "POST", payload())).status).toBe(200);
  expect(
    sqlite
      .prepare(
        "SELECT session_id AS sessionId FROM turnNotificationRegistration WHERE endpoint_id = ?",
      )
      .get(await deviceId()),
  ).toEqual({ sessionId: "ada-2" });
  expect(
    await (await request(`/api/turn-notifications/device?endpointId=${await deviceId()}`)).json(),
  ).toEqual({ generation: 0, registered: true });
});

it("detaches an expired install across accounts only after an explicit enrollment", async () => {
  await request("/api/turn-notifications/preference", "PUT", '{"enabled":true}');
  await request("/api/turn-notifications/device", "POST", payload());
  signIn("ben", "ben-1");
  await request("/api/turn-notifications/preference", "PUT", '{"enabled":true}');
  expect(
    await (await request(`/api/turn-notifications/device?endpointId=${await deviceId()}`)).json(),
  ).toEqual({ generation: 0, registered: false });
  expect((await request("/api/turn-notifications/device", "POST", payload())).status).toBe(409);
  sqlite.prepare("UPDATE session SET expires_at = 0 WHERE id = ?").run("ada-1");
  expect((await request("/api/turn-notifications/device", "POST", payload())).status).toBe(200);
  expect(
    sqlite
      .prepare("SELECT user_id, session_id FROM turnNotificationRegistration WHERE endpoint_id = ?")
      .get(await deviceId()),
  ).toEqual({ user_id: "ben", session_id: "ben-1" });
});

it("removes a signed-out session's registration without touching other installs or consent", async () => {
  await request("/api/turn-notifications/preference", "PUT", '{"enabled":true}');
  await request("/api/turn-notifications/device", "POST", payload());
  signIn("ada", "ada-2");
  await request(
    "/api/turn-notifications/device",
    "POST",
    payload(0, "https://fcm.googleapis.com/fcm/send/second"),
  );
  sqlite.prepare("DELETE FROM session WHERE id = ?").run("ada-1"); // Better Auth sign-out
  expect(sqlite.prepare("SELECT session_id FROM turnNotificationRegistration").all()).toEqual([
    { session_id: "ada-2" },
  ]);
  expect(
    sqlite.prepare("SELECT enabled FROM turnNotificationPreference WHERE user_id = ?").get("ada"),
  ).toEqual({ enabled: 1 });
});

it("detaches only after a successful identity change, including OAuth callback and sign-up", async () => {
  await request("/api/turn-notifications/preference", "PUT", '{"enabled":true}');
  await request("/api/turn-notifications/device", "POST", payload());
  signIn("ada", "ada-2");
  await request(
    "/api/turn-notifications/device",
    "POST",
    payload(0, "https://fcm.googleapis.com/fcm/send/second"),
  );
  signIn("ada", "ada-1");
  authHandler.mockResolvedValueOnce(new Response("bad password", { status: 401 }));
  expect((await request("/api/auth/sign-in/email", "POST", "{}")).status).toBe(401);
  expect(
    sqlite.prepare("SELECT count(*) AS count FROM turnNotificationRegistration").get(),
  ).toEqual({ count: 2 });
  expect((await request("/api/auth/sign-in/email", "POST", "{}")).status).toBe(200);
  expect(sqlite.prepare("SELECT session_id FROM turnNotificationRegistration").all()).toEqual([
    { session_id: "ada-2" },
  ]);
  expect(authHandler).toHaveBeenCalledTimes(2);
  signIn("ada", "ada-2");
  expect((await request("/api/auth/sign-in/social", "POST", "{}")).status).toBe(200);
  expect(
    sqlite.prepare("SELECT count(*) AS count FROM turnNotificationRegistration").get(),
  ).toEqual({ count: 1 });
  authHandler.mockResolvedValueOnce(
    new Response(null, {
      status: 302,
      headers: { Location: "https://local.bigtwo.com/?error=cancelled" },
    }),
  );
  await request("/api/auth/callback/google");
  expect(
    sqlite.prepare("SELECT count(*) AS count FROM turnNotificationRegistration").get(),
  ).toEqual({ count: 1 });
  authHandler.mockResolvedValueOnce(
    new Response(null, { status: 302, headers: { Location: "https://local.bigtwo.com/" } }),
  );
  await request("/api/auth/callback/google");
  expect(sqlite.prepare("SELECT * FROM turnNotificationRegistration").all()).toEqual([]);
  await request(
    "/api/turn-notifications/device",
    "POST",
    payload(0, "https://fcm.googleapis.com/fcm/send/second"),
  );
  expect((await request("/api/auth/sign-up/email", "POST", "{}")).status).toBe(200);
  expect(sqlite.prepare("SELECT * FROM turnNotificationRegistration").all()).toEqual([]);
});

it("marks deletion and clears registrations atomically before room cleanup", async () => {
  await request("/api/turn-notifications/preference", "PUT", '{"enabled":true}');
  await request("/api/turn-notifications/device", "POST", payload());
  await revokeTurnsForDeletion(env.BIG_TWO_DB, "ada");
  expect(sqlite.prepare("SELECT user_id FROM accountDeletion").all()).toEqual([{ user_id: "ada" }]);
  expect(sqlite.prepare("SELECT * FROM turnNotificationRegistration").all()).toEqual([]);
  expect((await request("/api/turn-notifications/device", "POST", payload())).status).toBe(409);
  await revokeTurnsForDeletion(env.BIG_TWO_DB, "ada"); // retry is safe
  expect(sqlite.prepare("SELECT user_id FROM accountDeletion").all()).toEqual([{ user_id: "ada" }]);
});

it("does not start deletion if registration cleanup cannot be committed", async () => {
  await request("/api/turn-notifications/preference", "PUT", '{"enabled":true}');
  await request("/api/turn-notifications/device", "POST", payload());
  sqlite.exec(`CREATE TRIGGER prevent_delete BEFORE DELETE ON turnNotificationRegistration
    BEGIN SELECT RAISE(ABORT, 'unavailable'); END;`);
  await expect(revokeTurnsForDeletion(env.BIG_TWO_DB, "ada")).rejects.toThrow();
  expect(sqlite.prepare("SELECT * FROM accountDeletion").all()).toEqual([]);
  expect(
    sqlite.prepare("SELECT count(*) AS count FROM turnNotificationRegistration").get(),
  ).toEqual({ count: 1 });
});

it("does not return or log subscription secrets if registration storage fails", async () => {
  await request("/api/turn-notifications/preference", "PUT", '{"enabled":true}');
  const secret = Buffer.alloc(16, 2).toString("base64url");
  const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  const failure = vi.spyOn(env.BIG_TWO_DB, "prepare").mockImplementationOnce(() => {
    throw new Error(secret);
  });
  try {
    const response = await request("/api/turn-notifications/device", "POST", payload());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(secret);
    expect(errorLog).not.toHaveBeenCalled();
  } finally {
    errorLog.mockRestore();
    failure.mockRestore();
  }
});

const nativePayload = (generation = 0, token = "ExponentPushToken[native-device]") =>
  JSON.stringify({ transport: "expo", token, generation });

it("enrolls native addresses with the same account/session/generation gates as web", async () => {
  expect((await request("/api/turn-notifications/device", "POST", nativePayload())).status).toBe(
    409,
  );
  await request("/api/turn-notifications/preference", "PUT", '{"enabled":true}');
  const enrolled = await App.request(
    "/api/turn-notifications/device",
    {
      method: "POST",
      headers: { Origin: "bigtwocrew://", "Content-Type": "application/json" },
      body: nativePayload(),
    },
    env,
  );
  expect(enrolled.status).toBe(200);
  expect(await enrolled.json()).toEqual({ registered: true });
  const row = sqlite
    .prepare("SELECT endpoint_id, endpoint, p256dh, auth FROM turnNotificationRegistration")
    .get() as { endpoint_id: string };
  expect(row).toMatchObject({
    endpoint: "expo:ExponentPushToken[native-device]",
    p256dh: "",
    auth: "",
  });
  expect(
    await (await request(`/api/turn-notifications/device?endpointId=${row.endpoint_id}`)).json(),
  ).toEqual({ registered: true, generation: 0 });
  signIn("ben", "ben-1");
  await request("/api/turn-notifications/preference", "PUT", '{"enabled":true}');
  expect((await request("/api/turn-notifications/device", "POST", nativePayload())).status).toBe(
    409,
  );
  signIn("ada", "ada-1");
  await request("/api/turn-notifications/preference", "PUT", '{"enabled":false}');
  await request("/api/turn-notifications/preference", "PUT", '{"enabled":true}');
  expect((await request("/api/turn-notifications/device", "POST", nativePayload())).status).toBe(
    409,
  );
  expect((await request("/api/turn-notifications/device", "POST", nativePayload(1))).status).toBe(
    200,
  );
  await request(
    "/api/turn-notifications/device",
    "DELETE",
    JSON.stringify({ endpointId: row.endpoint_id }),
  );
  expect(sqlite.prepare("SELECT * FROM turnNotificationRegistration").all()).toEqual([]);
});

it("does not treat arbitrary URLs or mixed web/native payloads as Expo tokens", async () => {
  for (const token of [
    "https://exp.host/--/api/v2/push/send",
    "ExpoPushToken[bad\nvalue]",
    "ExpoPushToken[]",
    "ExpoPushToken[" + "x".repeat(300) + "]",
  ])
    expect(
      (await request("/api/turn-notifications/device", "POST", nativePayload(0, token))).status,
    ).toBe(400);
  expect(
    (
      await request(
        "/api/turn-notifications/device",
        "POST",
        JSON.stringify({ ...JSON.parse(nativePayload()), endpoint }),
      )
    ).status,
  ).toBe(400);
  const response = await App.request(
    "/api/turn-notifications/device",
    {
      method: "POST",
      headers: { Origin: "https://evil.test", "Content-Type": "application/json" },
      body: nativePayload(),
    },
    env,
  );
  expect(response.status).toBe(403);
});
