// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { turnNotificationDevice } from "./turn-notification-device";

const { get, post, remove } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), remove: vi.fn() }));
vi.mock("~/libs/hono-client", () => ({
  honoClient: {
    api: { "turn-notifications": { device: { $get: get, $post: post, $delete: remove } } },
  },
}));

const originalWorker = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");
const originalAgent = Object.getOwnPropertyDescriptor(navigator, "userAgent");
const originalContext = Object.getOwnPropertyDescriptor(window, "isSecureContext");
const oldSubscription = { current: null as null | PushSubscription };
const requestPermission = vi.fn();
const subscribe = vi.fn();
const getRegistration = vi.fn();
const register = vi.fn();
const worker = { pushManager: { getSubscription: async () => oldSubscription.current, subscribe } };

beforeEach(() => {
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    value: "Mozilla/5.0 Chrome/125",
  });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { getRegistration, register },
  });
  vi.stubGlobal("PushManager", class {});
  vi.stubGlobal("Notification", { permission: "default", requestPermission });
  vi.stubEnv("VITE_VAPID_PUBLIC_KEY", Buffer.alloc(65, 4).toString("base64url"));
  getRegistration.mockResolvedValue(worker);
  register.mockResolvedValue(worker);
  get.mockResolvedValue({ ok: true, json: async () => ({ registered: false, generation: 2 }) });
  post.mockResolvedValue({ ok: true, json: async () => ({ registered: true }) });
  remove.mockResolvedValue({ ok: true });
  oldSubscription.current = null;
});

afterEach(() => {
  if (originalWorker) Object.defineProperty(navigator, "serviceWorker", originalWorker);
  else Reflect.deleteProperty(navigator, "serviceWorker");
  if (originalAgent) Object.defineProperty(navigator, "userAgent", originalAgent);
  else Reflect.deleteProperty(navigator, "userAgent");
  if (originalContext) Object.defineProperty(window, "isSecureContext", originalContext);
  else Reflect.deleteProperty(window, "isSecureContext");
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  localStorage.clear();
  vi.clearAllMocks();
});

it("never prompts during inspection and blocks denied permission without subscribing", async () => {
  expect(await turnNotificationDevice.inspect()).toEqual({
    state: "not-enabled",
    generation: 2,
    removable: false,
  });
  expect(requestPermission).not.toHaveBeenCalled();
  vi.stubGlobal("Notification", { permission: "denied", requestPermission });
  expect(await turnNotificationDevice.inspect()).toEqual({
    state: "blocked",
    generation: 2,
    removable: false,
  });
  await expect(turnNotificationDevice.enable(2)).rejects.toThrow();
  expect(requestPermission).not.toHaveBeenCalled();
  expect(subscribe).not.toHaveBeenCalled();
});

it("requires permission, subscription and registration, and retries after a subscription failure", async () => {
  requestPermission.mockResolvedValueOnce("granted").mockResolvedValueOnce("granted");
  subscribe.mockRejectedValueOnce(new Error("Push unavailable"));
  await expect(turnNotificationDevice.enable(2)).rejects.toThrow("Push unavailable");
  expect(post).not.toHaveBeenCalled();
  const current = {
    endpoint: "https://fcm.googleapis.com/fcm/send/device-token",
    options: { applicationServerKey: null },
    toJSON: () => ({
      endpoint: "https://fcm.googleapis.com/fcm/send/device-token",
      keys: {
        p256dh: Buffer.alloc(65, 4).toString("base64url"),
        auth: Buffer.alloc(16, 4).toString("base64url"),
      },
    }),
    unsubscribe: vi.fn(),
  } as unknown as PushSubscription;
  subscribe.mockResolvedValueOnce(current);
  await turnNotificationDevice.enable(2);
  expect(post).toHaveBeenCalledWith({
    json: { endpoint: current.endpoint, keys: current.toJSON().keys, generation: 2 },
  });
  expect(requestPermission).toHaveBeenCalledTimes(2);
});

it("does not subscribe after permission denial and does not report revoked permission as Ready", async () => {
  requestPermission.mockResolvedValue("denied");
  await expect(turnNotificationDevice.enable(2)).rejects.toThrow();
  expect(subscribe).not.toHaveBeenCalled();
  expect(post).not.toHaveBeenCalled();
  get.mockResolvedValue({ ok: true, json: async () => ({ registered: true, generation: 2 }) });
  expect(await turnNotificationDevice.inspect()).toMatchObject({ state: "blocked" });
});

it("requires server confirmation even after permission and subscription", async () => {
  vi.stubGlobal("Notification", { permission: "granted", requestPermission });
  subscribe.mockResolvedValue({
    endpoint: "https://fcm.googleapis.com/fcm/send/device-token",
    toJSON: () => ({
      endpoint: "https://fcm.googleapis.com/fcm/send/device-token",
      keys: {
        p256dh: Buffer.alloc(65, 4).toString("base64url"),
        auth: Buffer.alloc(16, 4).toString("base64url"),
      },
    }),
  });
  post.mockResolvedValue({ ok: false });
  await expect(turnNotificationDevice.enable(2)).rejects.toThrow("Could not register");
  expect(requestPermission).not.toHaveBeenCalled();
});

it("explains the device limit instead of suggesting a retry after a rejected enrollment", async () => {
  vi.stubGlobal("Notification", { permission: "granted", requestPermission });
  subscribe.mockResolvedValue({
    endpoint: "https://fcm.googleapis.com/fcm/send/device-token",
    toJSON: () => ({
      endpoint: "https://fcm.googleapis.com/fcm/send/device-token",
      keys: {
        p256dh: Buffer.alloc(65, 4).toString("base64url"),
        auth: Buffer.alloc(16, 4).toString("base64url"),
      },
    }),
  });
  post.mockResolvedValue({
    ok: false,
    status: 409,
    json: async () => ({ error: "Remove another device (limit 8)" }),
  });
  await expect(turnNotificationDevice.enable(2)).rejects.toThrow("Remove another device (limit 8)");
});

it("removes a registered install after browser permission is revoked", async () => {
  vi.stubGlobal("Notification", { permission: "granted", requestPermission });
  const unsubscribe = vi.fn();
  const current = {
    endpoint: "https://fcm.googleapis.com/fcm/send/device-token",
    options: { applicationServerKey: null },
    toJSON: () => ({
      endpoint: "https://fcm.googleapis.com/fcm/send/device-token",
      keys: {
        p256dh: Buffer.alloc(65, 4).toString("base64url"),
        auth: Buffer.alloc(16, 4).toString("base64url"),
      },
    }),
    unsubscribe,
  } as unknown as PushSubscription;
  subscribe.mockResolvedValue(current);
  await turnNotificationDevice.enable(2);
  vi.stubGlobal("Notification", { permission: "denied", requestPermission });
  get.mockResolvedValue({ ok: true, json: async () => ({ registered: true, generation: 2 }) });
  expect(await turnNotificationDevice.inspect()).toMatchObject({
    state: "blocked",
    removable: true,
  });
  await turnNotificationDevice.remove();
  expect(remove).toHaveBeenCalledWith({
    json: { endpointId: expect.stringMatching(/^[a-f0-9]{64}$/) },
  });
  expect(unsubscribe).not.toHaveBeenCalled();
});

it("does not call a stale-key subscription Ready", async () => {
  vi.stubGlobal("Notification", { permission: "granted", requestPermission });
  oldSubscription.current = {
    endpoint: "https://fcm.googleapis.com/fcm/send/device-token",
    options: { applicationServerKey: Buffer.alloc(65, 9).buffer },
  } as unknown as PushSubscription;
  get.mockResolvedValue({ ok: true, json: async () => ({ registered: true, generation: 2 }) });
  expect(await turnNotificationDevice.inspect()).toMatchObject({ state: "not-enabled" });
});

it("retires an old-key registration before a replacement subscription attempt", async () => {
  vi.stubGlobal("Notification", { permission: "granted", requestPermission });
  const unsubscribe = vi.fn().mockResolvedValue(true);
  oldSubscription.current = {
    endpoint: "https://fcm.googleapis.com/fcm/send/old",
    options: { applicationServerKey: Buffer.alloc(65, 9).buffer },
    unsubscribe,
  } as unknown as PushSubscription;
  subscribe.mockRejectedValueOnce(new Error("Could not subscribe"));
  await expect(turnNotificationDevice.enable(2)).rejects.toThrow("Could not subscribe");
  expect(remove).toHaveBeenCalledOnce();
  expect(unsubscribe).toHaveBeenCalledOnce();
  expect(post).not.toHaveBeenCalled();
});

it("treats reset permission on a registered install as Blocked without prompting", async () => {
  localStorage.setItem("big-two-turn-device-id", "a".repeat(64));
  get.mockResolvedValue({ ok: true, json: async () => ({ registered: true, generation: 1 }) });
  expect(await turnNotificationDevice.inspect()).toMatchObject({
    state: "blocked",
    removable: true,
  });
  expect(requestPermission).not.toHaveBeenCalled();
});

it("keeps ordinary iOS tabs and unverified WebKit surfaces unavailable", async () => {
  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    value: "Mozilla/5.0 (iPhone) AppleWebKit Safari/605",
  });
  expect(await turnNotificationDevice.inspect()).toMatchObject({
    state: "unavailable",
    reason: expect.stringContaining("Home Screen"),
  });
  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    value: "Mozilla/5.0 (Macintosh) AppleWebKit Safari/605",
  });
  expect(await turnNotificationDevice.inspect()).toMatchObject({
    state: "unavailable",
    reason: expect.stringContaining("verification"),
  });
  expect(get).not.toHaveBeenCalled();
  expect(requestPermission).not.toHaveBeenCalled();
});
