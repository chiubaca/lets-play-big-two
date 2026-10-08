import { beforeEach, expect, it, vi } from "vite-plus/test";
import { createTurnDevice, type DeviceInstall, type PushPlatform } from "./turn-device";
import type { createRequest } from "../network/request";

let install: DeviceInstall | null;
let current: boolean;
let platform: PushPlatform;
const request = vi.fn<ReturnType<typeof createRequest>>();
const saved = { token: "ExpoPushToken[old]", endpointId: "a".repeat(64) };
const create = () =>
  createTurnDevice(request as ReturnType<typeof createRequest>, platform, () => current);
beforeEach(() => {
  current = true;
  install = saved;
  request.mockReset().mockResolvedValue({ generation: 3, registered: true });
  platform = {
    unavailable: () => undefined,
    permission: vi.fn(async () => ({ allowed: true, canAskAgain: true })),
    token: vi.fn(async () => saved.token),
    hash: vi.fn(async () => saved.endpointId),
    read: async () => install,
    save: vi.fn(async (value) => {
      install = value;
    }),
    dismiss: vi.fn(async () => {}),
  };
});

it("reports Ready only for granted permission, a current Expo token and a live server enrollment", async () => {
  expect(await create().inspect()).toMatchObject({
    state: "ready",
    generation: 3,
    removable: true,
  });
  expect(platform.permission).toHaveBeenCalledWith(false);
  request.mockResolvedValue({ generation: 4, registered: false });
  expect(await create().inspect()).toMatchObject({ state: "not-enabled", generation: 4 });
  request.mockResolvedValue({ generation: 3, registered: true });
  vi.mocked(platform.token).mockResolvedValue("ExpoPushToken[new]");
  expect(await create().inspect()).toMatchObject({ state: "not-enabled" });
});

it("account-on and inspection do not request device permission or enroll the install", async () => {
  const device = create();
  await device.setPreference(true);
  await device.inspect();
  expect(platform.permission).not.toHaveBeenCalledWith(true);
  expect(request.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(0);
});

it("requires explicit permission and enrolls using the displayed consent generation", async () => {
  await create().enable(3);
  expect(platform.permission).toHaveBeenCalledWith(true);
  expect(platform.hash).toHaveBeenCalledWith(`expo:${saved.token}`);
  expect(request).toHaveBeenCalledWith("/api/turn-notifications/device", {
    method: "POST",
    json: { transport: "expo", token: saved.token, generation: 3 },
  });
  expect(platform.save).toHaveBeenCalledWith(saved);
});

it("never reports success after a denied permission or failed enrollment", async () => {
  vi.mocked(platform.permission).mockResolvedValue({ allowed: false, canAskAgain: false });
  expect(await create().inspect()).toMatchObject({ state: "blocked", removable: true });
  await expect(create().enable(3)).rejects.toThrow("system settings");
  expect(platform.save).not.toHaveBeenCalled();
  vi.mocked(platform.permission).mockResolvedValue({ allowed: true, canAskAgain: true });
  request.mockRejectedValue(new Error("stale generation"));
  await expect(create().enable(3)).rejects.toThrow("stale generation");
  expect(platform.save).toHaveBeenCalledWith(saved);
  request.mockResolvedValue({ generation: 4, registered: false });
  expect(await create().inspect()).toMatchObject({ state: "not-enabled" });
});

it("does not enroll if local removal evidence cannot be persisted", async () => {
  vi.mocked(platform.save).mockRejectedValue(new Error("SecureStore unavailable"));
  await expect(create().enable(3)).rejects.toThrow("SecureStore unavailable");
  expect(request).not.toHaveBeenCalled();
});

it("retires the previous token before explicit replacement and clears the tray on device-off", async () => {
  vi.mocked(platform.token).mockResolvedValue("ExpoPushToken[new]");
  vi.mocked(platform.hash).mockResolvedValue("b".repeat(64));
  const device = create();
  await device.enable(3);
  expect(request.mock.calls.map(([, options]) => options?.method)).toEqual(["DELETE", "POST"]);
  await device.remove();
  expect(install).toBeNull();
  expect(platform.dismiss).toHaveBeenCalled();
});

it("does not discard local removal evidence when server removal fails", async () => {
  request.mockRejectedValue(new Error("offline"));
  await expect(create().remove()).rejects.toThrow("offline");
  expect(install).toEqual(saved);
  expect(platform.dismiss).not.toHaveBeenCalled();
});

it("refreshes Expo's device mapping without reviving revoked consent or re-enrolling a changed address", async () => {
  request.mockResolvedValue({ registered: false, generation: 4 });
  await create().refreshToken();
  expect(platform.token).not.toHaveBeenCalled();
  request.mockResolvedValue({ registered: true, generation: 3 });
  vi.mocked(platform.token).mockResolvedValue("ExpoPushToken[new]");
  await create().refreshToken();
  expect(request).toHaveBeenCalledWith("/api/turn-notifications/device", {
    method: "DELETE",
    json: { endpointId: saved.endpointId },
  });
  expect(request.mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
});

it("does not enroll for a replacement identity after a permission prompt completes", async () => {
  vi.mocked(platform.permission).mockImplementation(async () => {
    current = false;
    return { allowed: true, canAskAgain: true };
  });
  await expect(create().enable(3)).rejects.toThrow("session changed");
  expect(request).not.toHaveBeenCalled();
  expect(platform.save).not.toHaveBeenCalled();
});

it("fails honestly on an unconfigured build without prompting or making requests", async () => {
  platform.unavailable = () => "Missing EAS project ID";
  expect(await create().inspect()).toEqual({
    state: "unavailable",
    generation: 0,
    reason: "Missing EAS project ID",
  });
  await expect(create().enable(0)).rejects.toThrow("Missing EAS project ID");
  expect(request).not.toHaveBeenCalled();
  expect(platform.permission).not.toHaveBeenCalled();
});
