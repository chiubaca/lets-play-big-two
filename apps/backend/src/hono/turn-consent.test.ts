import { afterEach, expect, it, vi } from "vite-plus/test";
import { App } from "./app";
import {
  accountDeletionTable,
  turnNotificationPreferenceTable,
  userTable,
} from "@big-two/data-ops/drizzle/schema";

const getSession = vi.fn();
const preferences = new Map<string, boolean>();
const users = new Set(["ada", "ben"]);
let deleting = false;
let currentUser = "ada";

vi.mock("../lib/auth", () => ({
  auth: { api: { getSession: (...args: unknown[]) => getSession(...args) } },
}));
vi.mock("@big-two/data-ops/database", () => ({
  getDb: () => ({
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: async () =>
            table === accountDeletionTable
              ? deleting
                ? [{ userId: "ada" }]
                : []
              : table === userTable
                ? users.has(currentUser)
                  ? [{ id: currentUser }]
                  : []
                : table === turnNotificationPreferenceTable
                  ? preferences.has(currentUser)
                    ? [{ enabled: preferences.get(currentUser) }]
                    : []
                  : [],
        }),
      }),
    }),
    insert: (table: unknown) => ({
      values: (value: { userId: string; enabled: boolean }) => ({
        onConflictDoUpdate: () => ({
          returning: async () => {
            if (table !== turnNotificationPreferenceTable || !users.has(value.userId) || deleting)
              return [];
            preferences.set(value.userId, value.enabled);
            return [{ enabled: value.enabled }];
          },
        }),
      }),
    }),
    delete: () => ({ where: async () => {} }),
  }),
}));

const env = {} as Cloudflare.Env;
const get = () => App.request("/api/turn-notifications/preference", {}, env);
const put = (body: string, origin = "https://local.bigtwo.com") =>
  App.request(
    "/api/turn-notifications/preference",
    { method: "PUT", headers: { "Content-Type": "application/json", Origin: origin }, body },
    env,
  );
const signIn = (id: string) => {
  currentUser = id;
  getSession.mockResolvedValue({ user: { id }, session: { id: `${id}-session` } });
};

afterEach(() => {
  getSession.mockReset();
  preferences.clear();
  users.clear();
  users.add("ada");
  users.add("ben");
  deleting = false;
});

it("starts off, saves consent for the account, and reads the same value on another session", async () => {
  signIn("ada");
  const initial = await get();
  expect(initial.status).toBe(200);
  expect(initial.headers.get("Cache-Control")).toBe("no-store");
  expect(await initial.json()).toEqual({ enabled: false });
  const saved = await put('{"enabled":true}');
  expect(saved.status).toBe(200);
  expect(await saved.json()).toEqual({ enabled: true });
  signIn("ben");
  expect(await (await get()).json()).toEqual({ enabled: false });
  signIn("ada");
  expect(await (await get()).json()).toEqual({ enabled: true });
  expect(await (await put('{"enabled":false}')).json()).toEqual({ enabled: false });
});

it("rejects unauthenticated, deleting and deleted accounts for both reads and writes", async () => {
  getSession.mockResolvedValue(null);
  expect((await get()).status).toBe(401);
  expect((await put('{"enabled":true}')).status).toBe(401);
  signIn("ada");
  deleting = true;
  expect((await get()).status).toBe(409);
  expect((await put('{"enabled":true}')).status).toBe(409);
  deleting = false;
  users.delete("ada");
  expect((await get()).status).not.toBe(200);
  expect((await put('{"enabled":true}')).status).not.toBe(200);
  expect(preferences.size).toBe(0);
});

it("rejects forged and malformed preference writes", async () => {
  signIn("ada");
  expect((await put('{"enabled":true}', "https://foreign.example")).status).toBe(403);
  expect((await put('{"enabled":"true"}')).status).toBe(400);
  expect((await put('{"enabled":true,"userId":"ben"}')).status).toBe(400);
  expect((await put("{bad")).status).toBe(400);
  expect(preferences.size).toBe(0);
});
