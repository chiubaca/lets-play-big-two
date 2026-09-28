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

async function worker(entries = new Map<string, Response>(), subscriptionEndpoint = endpoint) {
  const hash = await webcrypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(subscriptionEndpoint),
  );
  const endpointId = Buffer.from(hash).toString("hex");
  payload.endpointId = endpointId;
  const listeners = new Map<string, (event: unknown) => void>();
  const showNotification = vi.fn(async () => {});
  const openWindow = vi.fn(async () => {});
  const fetch = vi.fn(
    async (_url: string) =>
      new Response(JSON.stringify({ eligible: true, target: `/turn-return?ticket=${ticket}` }), {
        status: 200,
      }),
  );
  const clients: {
    matchAll: () => Promise<{ url: string; focus: () => Promise<void> }[]>;
    openWindow: typeof openWindow;
  } = { matchAll: async () => [], openWindow };
  const self = {
    location: { origin: "https://big-two.chiubaca.com" },
    registration: {
      pushManager: { getSubscription: async () => ({ endpoint: subscriptionEndpoint }) },
      showNotification,
    },
    clients,
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
        delete: async (key: string) => entries.delete(key),
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
  return { fire, showNotification, openWindow, fetch, clients: self.clients, endpointId };
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

it("persists per-room/per-Turn receipts across worker reloads and ignores duplicates without another check", async () => {
  const entries = new Map<string, Response>();
  const first = await worker(entries);
  await first.fire("push", { data: { json: () => payload } });
  const reloaded = await worker(entries);
  await reloaded.fire("push", { data: { json: () => payload } });
  expect(reloaded.fetch).not.toHaveBeenCalled();
  expect(reloaded.showNotification).not.toHaveBeenCalled();
  const nextTurn = "22222222-2222-4222-8222-222222222222";
  await reloaded.fire("push", { data: { json: () => ({ ...payload, turnId: nextTurn }) } });
  await reloaded.fire("push", { data: { json: () => ({ ...payload, roomId: "FGHIJ" }) } });
  expect(reloaded.showNotification).toHaveBeenNthCalledWith(1, "It’s your turn", {
    tag: `${room}:${nextTurn}`,
    data: { ticket },
  });
  expect(reloaded.showNotification).toHaveBeenNthCalledWith(2, "It’s your turn", {
    tag: `FGHIJ:${turn}`,
    data: { ticket },
  });
});

it("delivers once to each enrolled install without sharing device receipts", async () => {
  const first = await worker();
  const second = await worker(new Map(), "https://fcm.googleapis.com/fcm/send/second");
  for (const install of [first, second]) {
    const notice = { ...payload, endpointId: install.endpointId };
    await install.fire("push", { data: { json: () => notice } });
    await install.fire("push", { data: { json: () => notice } });
    expect(install.showNotification).toHaveBeenCalledTimes(1);
    expect(install.fetch).toHaveBeenCalledTimes(1);
  }
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

it("serializes concurrent receipts and permits a new receipt after display failure", async () => {
  const w = await worker();
  let rejectDisplay!: (error: Error) => void;
  w.showNotification.mockImplementationOnce(
    () =>
      new Promise<void>((_resolve, reject) => {
        rejectDisplay = reject;
      }),
  );
  const first = w.fire("push", { data: { json: () => payload } });
  await vi.waitFor(() => expect(w.showNotification).toHaveBeenCalledTimes(1));
  await w.fire("push", { data: { json: () => payload } });
  expect(w.showNotification).toHaveBeenCalledTimes(1);
  rejectDisplay(new Error("OS refused display"));
  await first;
  await w.fire("push", { data: { json: () => payload } });
  expect(w.showNotification).toHaveBeenCalledTimes(2);
  await w.fire("push", { data: { json: () => payload } });
  expect(w.showNotification).toHaveBeenCalledTimes(2);
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

it("focuses an existing view of the intended room even when it has a query or fragment", async () => {
  const w = await worker();
  const focus = vi.fn(async () => {});
  w.clients.matchAll = async () => [
    { url: `https://big-two.chiubaca.com/room/${room}?foo=1#hand`, focus },
  ];
  w.fetch.mockResolvedValueOnce(
    new Response(JSON.stringify({ allowed: true, target: `/room/${room}` })),
  );
  await w.fire("notificationclick", { notification: { data: { ticket }, close: vi.fn() } });
  expect(focus).toHaveBeenCalledTimes(1);
  expect(w.openWindow).not.toHaveBeenCalled();
});
