import { expect, it, vi } from "vite-plus/test";
import { signOutAndDetachTurnDevice } from "./turn-sign-out";

const { remove, forget, signOut } = vi.hoisted(() => ({
  remove: vi.fn(),
  forget: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("~/components/game-room/turn-notification-device", () => ({
  turnNotificationDevice: { remove },
  forgetTurnNotificationInstall: forget,
}));
vi.mock("./auth-client", () => ({ authClient: { signOut } }));

it("revokes the install before ending the session, even if the device API is unavailable", async () => {
  remove.mockRejectedValueOnce(new Error("offline"));
  forget.mockResolvedValue(undefined);
  signOut.mockResolvedValue({ data: { success: true } });
  await signOutAndDetachTurnDevice();
  expect(remove).toHaveBeenCalledOnce();
  expect(forget).toHaveBeenCalledOnce();
  expect(signOut).toHaveBeenCalledOnce();
  expect(remove.mock.invocationCallOrder[0]).toBeLessThan(signOut.mock.invocationCallOrder[0]);
});
