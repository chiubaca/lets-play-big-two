import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { webcrypto } from "node:crypto";
import { expect, it, vi } from "vite-plus/test";

const endpoint = "https://fcm.googleapis.com/fcm/send/test";
const room = "ABCDE";
const turn = "11111111-1111-4111-8111-111111111111";
const ticket = "a".repeat(50);
const payload = { roomId: room, turnId: turn, endpointId: "" };
const script = readFileSync(new URL("../public/service-worker.js", import.meta.url), "utf8");

async function worker() {
  const hash = await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  payload.endpointId = Buffer.from(hash).toString("hex");
  const listeners = new Map<string, (event: unknown) => void>();
  const entries = new Map<string, Response>();
  const showNotification = vi.fn(async () => {});
  const openWindow = vi.fn(async () => {});
  const fetch = vi.fn(
    async (_url: string) =>
      new Response(JSON.stringify({ eligible: true, target: `/turn-return?ticket=${ticket}` }), {
        status: 200,
      }),
  );
  const self = {
    location: { origin: "https://big-two.chiubaca.com" },
    registration: {
      pushManager: { getSubscription: async () => ({ endpoint }) },
      showNotification,
    },
    clients: { matchAll: async () => [], openWindow },
    addEventListener: (name: string, handler: (event: unknown) => void) =>
      listeners.set(name, handler),
  };
  runInNewContext(script, {
    self,
    crypto: webcrypto,
    TextEncoder,
    URL,
    URLSearchParams,
    Response,
    fetch,
    caches: {
      open: async () => ({
        match: async (key: string) => entries.get(key),
        put: async (key: string, response: Response) => {
          entries.set(key, response);
        },
      }),
    },
  });
  async function fire(name: string, event: object) {
    let work: Promise<unknown> | undefined;
    listeners.get(name)?.({
      ...event,
      waitUntil: (promise: Promise<unknown>) => {
        work = promise;
      },
    });
    await work;
  }
  return { fire, showNotification, openWindow, fetch };
}

it("shows only generic text after a non-cached authenticated check, once per Turn, without replacing another room", async () => {
  const w = await worker();
  await w.fire("push", { data: { json: () => payload } });
  expect(w.fetch).toHaveBeenCalledWith(
    expect.stringContaining("/api/turn-notifications/check?"),
    expect.objectContaining({ credentials: "include", cache: "no-store" }),
  );
  expect(w.showNotification).toHaveBeenCalledWith("It’s your turn", {
    tag: `${room}:${turn}`,
    data: { ticket },
  });
  await w.fire("push", { data: { json: () => payload } });
  expect(w.showNotification).toHaveBeenCalledTimes(1);
  await w.fire("push", { data: { json: () => ({ ...payload, roomId: "FGHIJ" }) } });
  expect(w.showNotification).toHaveBeenCalledWith("It’s your turn", {
    tag: `FGHIJ:${turn}`,
    data: { ticket },
  });
});

it("never displays on malformed payload, missing enrollment, unavailable check, or stale account", async () => {
  const w = await worker();
  await w.fire("push", { data: { json: () => ({ ...payload, endpointId: "b".repeat(64) }) } });
  await w.fire("push", { data: { json: () => ({ ...payload, roomId: "https://evil.example" }) } });
  w.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ eligible: false })));
  await w.fire("push", { data: { json: () => payload } });
  w.fetch.mockRejectedValueOnce(new Error("offline"));
  await w.fire("push", { data: { json: () => payload } });
  w.fetch.mockResolvedValueOnce(
    new Response(JSON.stringify({ eligible: true, target: "https://evil.example" })),
  );
  await w.fire("push", { data: { json: () => payload } });
  expect(w.showNotification).not.toHaveBeenCalled();
});

it("a tap under another account opens only the neutral identity gate, never a supplied room URL", async () => {
  const w = await worker();
  w.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ allowed: false })));
  await w.fire("notificationclick", { notification: { data: { ticket }, close: vi.fn() } });
  expect(w.openWindow).toHaveBeenCalledWith(
    `https://big-two.chiubaca.com/turn-return?ticket=${ticket}`,
  );
  expect(w.fetch).toHaveBeenCalledWith(
    expect.stringContaining("/api/turn-notifications/return?"),
    expect.objectContaining({ credentials: "include", cache: "no-store" }),
  );
  await w.fire("notificationclick", {
    notification: { data: { ticket: "//evil.example" }, close: vi.fn() },
  });
  expect(w.openWindow).toHaveBeenCalledTimes(1);
});
