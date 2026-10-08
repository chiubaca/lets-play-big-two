import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { checkExpoTurnReceipts, expoEndpoint } from "./expo-turn-push";
import { sendTurnPush, type RegisteredEndpoint } from "./turn-push";
import { readTurnTicket } from "./turn-ticket";

let sqlite: Database.Database;
let env: Env;
const token = "ExpoPushToken[valid-device-token]";
const registration: RegisteredEndpoint = {
  endpoint_id: "a".repeat(64),
  endpoint: expoEndpoint(token),
  p256dh: "",
  auth: "",
  session_id: "ada-session",
  generation: 0,
  enrollment_id: "e".repeat(32),
};
const notice = {
  roomId: "ABCDE",
  turnId: "11111111-1111-4111-8111-111111111111",
  endpointId: registration.endpoint_id,
};
const fetcher = vi.fn();
const eligible = vi.fn(async () => true);
const send = () => sendTurnPush(env, registration, notice, Date.now() + 60_000, eligible);

beforeEach(() => {
  sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`CREATE TABLE turnNotificationRegistration (endpoint_id text PRIMARY KEY, enrollment_id text, user_id text);
    INSERT INTO turnNotificationRegistration VALUES ('${registration.endpoint_id}', '${registration.enrollment_id}', 'ada');`);
  sqlite.exec(
    readFileSync(
      new URL("../../drizzle/migrations/0010_turn_push_receipts.sql", import.meta.url),
      "utf8",
    ),
  );
  env = {
    VAPID_PRIVATE_KEY: "existing-ticket-secret",
    EXPO_ACCESS_TOKEN: "backend-access-token",
    BIG_TWO_DB: {
      prepare(sql: string) {
        let params: unknown[] = [];
        return {
          bind(...values: unknown[]) {
            params = values;
            return this;
          },
          first: async () => sqlite.prepare(sql).get(...params) ?? null,
          all: async () => ({ results: sqlite.prepare(sql).all(...params) }),
          run: async () => sqlite.prepare(sql).run(...params),
        };
      },
    },
  } as unknown as Env;
  eligible.mockReset().mockResolvedValue(true);
  fetcher
    .mockReset()
    .mockImplementation(async () => Response.json({ data: { status: "ok", id: "receipt-1" } }));
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  sqlite.close();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("dispatches native delivery without web encryption keys, with a bounded lifetime and verified return ticket", async () => {
  expect(await send()).toBe("sent");
  const [url, options] = fetcher.mock.calls[0];
  expect(url).toBe("https://exp.host/--/api/v2/push/send");
  expect(options.headers.Authorization).toBe("Bearer backend-access-token");
  expect(options.redirect).toBe("error");
  const payload = JSON.parse(options.body);
  expect(payload).toMatchObject({
    to: token,
    channelId: "turns",
    priority: "high",
    data: notice,
    collapseId: `ABCDE:${notice.turnId}`,
    tag: `ABCDE:${notice.turnId}`,
  });
  expect(payload.ttl).toBeGreaterThanOrEqual(0);
  expect(payload.ttl).toBeLessThanOrEqual(60);
  expect(payload.body).not.toContain("ada");
  expect(await readTurnTicket(env.VAPID_PRIVATE_KEY, payload.data.ticket)).toEqual({
    roomId: "ABCDE",
    userId: "ada",
    enrollment: {
      endpoint_id: registration.endpoint_id,
      session_id: registration.session_id,
      generation: 0,
      enrollment_id: registration.enrollment_id,
    },
  });
  expect(
    sqlite.prepare("SELECT id, endpoint_id, enrollment_id FROM turnPushReceipt").all(),
  ).toEqual([
    {
      id: "receipt-1",
      endpoint_id: registration.endpoint_id,
      enrollment_id: registration.enrollment_id,
    },
  ]);
});

it("never sends an expired, no-longer-eligible, or malformed native destination", async () => {
  expect(await sendTurnPush(env, registration, notice, Date.now(), eligible)).toBe("retired");
  eligible.mockResolvedValue(false);
  expect(await send()).toBe("retired");
  expect(
    await sendTurnPush(
      env,
      { ...registration, endpoint: "expo:https://evil.test" },
      notice,
      Date.now() + 60_000,
      eligible,
    ),
  ).toBe("retired");
  expect(fetcher).not.toHaveBeenCalled();
});

it.each([408, 429, 500, 503])("uses existing bounded Turn retries for HTTP %i", async (status) => {
  fetcher.mockResolvedValue(new Response(null, { status }));
  expect(await send()).toBe("retry");
});

it("handles ticket-level errors, retiring only the captured enrollment", async () => {
  fetcher.mockResolvedValue(
    Response.json({ data: { status: "error", details: { error: "DeviceNotRegistered" } } }),
  );
  expect(await send()).toBe("retired");
  expect(sqlite.prepare("SELECT * FROM turnNotificationRegistration").all()).toEqual([]);
});

it("fails closed without a ticket secret and retries malformed provider responses", async () => {
  env.VAPID_PRIVATE_KEY = "";
  expect(await send()).toBe("retry");
  expect(fetcher).not.toHaveBeenCalled();
  env.VAPID_PRIVATE_KEY = "secret";
  fetcher.mockResolvedValue(Response.json({ data: { status: "ok" } }));
  expect(await send()).toBe("retry");
});

it("checks receipts after their delay and invalidates an uninstalled device", async () => {
  await send();
  fetcher.mockClear();
  await checkExpoTurnReceipts(env);
  expect(fetcher).not.toHaveBeenCalled();
  sqlite.prepare("UPDATE turnPushReceipt SET check_at = 0").run();
  fetcher.mockResolvedValue(
    Response.json({
      data: { "receipt-1": { status: "error", details: { error: "DeviceNotRegistered" } } },
    }),
  );
  await checkExpoTurnReceipts(env);
  expect(fetcher.mock.calls[0][0]).toBe("https://exp.host/--/api/v2/push/getReceipts");
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ ids: ["receipt-1"] });
  expect(sqlite.prepare("SELECT * FROM turnNotificationRegistration").all()).toEqual([]);
  expect(sqlite.prepare("SELECT * FROM turnPushReceipt").all()).toEqual([]);
});

it("does not erase a new enrollment in response to an old invalid-device receipt", async () => {
  await send();
  sqlite.prepare("UPDATE turnPushReceipt SET check_at = 0").run();
  sqlite.prepare("UPDATE turnNotificationRegistration SET enrollment_id = 'replacement'").run();
  fetcher.mockResolvedValue(
    Response.json({
      data: { "receipt-1": { status: "error", details: { error: "DeviceNotRegistered" } } },
    }),
  );
  await checkExpoTurnReceipts(env);
  expect(sqlite.prepare("SELECT enrollment_id FROM turnNotificationRegistration").get()).toEqual({
    enrollment_id: "replacement",
  });
});

it("reschedules missing receipts and expires them without logging provider secrets", async () => {
  await send();
  sqlite.prepare("UPDATE turnPushReceipt SET check_at = 0").run();
  fetcher.mockResolvedValue(Response.json({ data: {} }));
  await checkExpoTurnReceipts(env);
  expect(
    (sqlite.prepare("SELECT check_at FROM turnPushReceipt").get() as { check_at: number }).check_at,
  ).toBeGreaterThan(Date.now());
  sqlite.prepare("UPDATE turnPushReceipt SET check_at = 0").run();
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  fetcher.mockResolvedValue(
    Response.json({
      data: {
        "receipt-1": { status: "error", message: token, details: { error: "InvalidCredentials" } },
      },
    }),
  );
  await checkExpoTurnReceipts(env);
  expect(log).toHaveBeenCalledWith(
    JSON.stringify({ message: "Expo turn push receipt failed", code: "InvalidCredentials" }),
  );
  expect(sqlite.prepare("SELECT * FROM turnPushReceipt").all()).toEqual([]);
});

it("expires receipt tracking after 24 hours without attempting further provider requests", async () => {
  await send();
  sqlite.prepare("UPDATE turnPushReceipt SET expires_at = 0, check_at = 0").run();
  fetcher.mockClear();
  await checkExpoTurnReceipts(env);
  expect(fetcher).not.toHaveBeenCalled();
  expect(sqlite.prepare("SELECT * FROM turnPushReceipt").all()).toEqual([]);
});

it("does not expose a malformed provider response in an error", async () => {
  fetcher.mockResolvedValue(new Response(token));
  await expect(send()).rejects.toThrow("Invalid push response");
});
