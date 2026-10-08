import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import type { NativeSession } from "../network/auth-client";
import { useTurnNotifications } from "./use-turn-notifications";

const mocks = vi.hoisted(() => ({
  initial: vi.fn(),
  clear: vi.fn(),
  dismiss: vi.fn(),
  refresh: vi.fn(),
  request: vi.fn(),
  handler: null as null | { handleNotification: (notification: unknown) => Promise<unknown> },
  response: null as null | ((response: unknown) => void),
  foreground: true,
}));
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("../network/use-foreground", () => ({ useForeground: () => mocks.foreground }));
vi.mock("../network/auth-client", () => ({ authClient: { getCookie: () => "bound-cookie" } }));
vi.mock("./native-push", () => ({
  nativeTurnDevice: () => ({ refreshToken: mocks.refresh }),
  notificationRequest: () => mocks.request,
  pushPlatform: { dismiss: mocks.dismiss },
}));
vi.mock("expo-notifications", () => ({
  DEFAULT_ACTION_IDENTIFIER: "tap",
  getLastNotificationResponseAsync: mocks.initial,
  clearLastNotificationResponseAsync: mocks.clear,
  addNotificationResponseReceivedListener: (receive: (response: unknown) => void) => {
    mocks.response = receive;
    return { remove: vi.fn() };
  },
  addPushTokenListener: () => ({ remove: vi.fn() }),
  setNotificationHandler: (handler: typeof mocks.handler) => {
    mocks.handler = handler;
  },
}));

const ticket = "a".repeat(50);
const notice = {
  ticket,
  roomId: "ABCDE",
  turnId: "11111111-1111-4111-8111-111111111111",
  endpointId: "a".repeat(64),
};
const notification = { request: { identifier: "turn-1", content: { data: notice } } };
const response = { actionIdentifier: "tap", notification };
const onRoom = vi.fn();
let session: NativeSession | null;
let pending: boolean;
let room: string | undefined;
let renderer: ReactTestRenderer;
let state: ReturnType<typeof useTurnNotifications>;
function Harness() {
  state = useTurnNotifications(session, pending, room, onRoom);
  return null;
}
const mount = async () => {
  await act(async () => {
    renderer = create(createElement(Harness));
  });
};
const update = async () => {
  await act(async () => renderer.update(createElement(Harness)));
};
const signIn = (id = "session-1") => {
  session = { user: { id: "ada" }, session: { id } } as NativeSession;
};

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  session = null;
  pending = false;
  room = undefined;
  mocks.foreground = true;
  mocks.initial.mockReset().mockResolvedValue(null);
  mocks.clear.mockReset().mockResolvedValue(undefined);
  mocks.dismiss.mockReset().mockResolvedValue(undefined);
  mocks.refresh.mockReset().mockResolvedValue(undefined);
  mocks.request.mockReset().mockResolvedValue({ allowed: true, target: "/room/ABCDE" });
  onRoom.mockReset();
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
});

it("retains a cold-start tap across session hydration and signed-out sign-in", async () => {
  pending = true;
  mocks.initial.mockResolvedValue(response);
  await mount();
  expect(state.returning).toBe(true);
  expect(mocks.request).not.toHaveBeenCalled();
  pending = false;
  await update();
  expect(state.returning).toBe(true);
  expect(mocks.request).not.toHaveBeenCalled();
  signIn();
  await update();
  expect(mocks.request).toHaveBeenCalledWith(
    `/api/turn-notifications/return?ticket=${ticket}`,
    expect.any(Object),
  );
  expect(onRoom).toHaveBeenCalledOnce();
  expect(onRoom).toHaveBeenCalledWith("ABCDE");
  expect(state.returning).toBe(false);
});

it("handles a warm tap once and never follows the payload's claimed room without verification", async () => {
  signIn();
  await mount();
  await act(async () => {
    mocks.response!(response);
  });
  await act(async () => {
    mocks.response!(response);
  });
  expect(onRoom).toHaveBeenCalledOnce();
  expect(mocks.clear).toHaveBeenCalledOnce();
});

it("provides retry/lobby recovery for wrong-account, revoked and missing-room taps", async () => {
  signIn();
  mocks.initial.mockResolvedValue(response);
  mocks.request.mockResolvedValue({ allowed: false });
  await mount();
  expect(onRoom).not.toHaveBeenCalled();
  expect(state.error).toContain("account that received");
  mocks.request.mockResolvedValue({ allowed: true, missing: true });
  await act(async () => state.retry());
  expect(state.error).toContain("no longer available");
  await act(async () => state.close());
  expect(state.returning).toBe(false);
});

it("ignores a late verification after a session changes or the return panel is closed", async () => {
  signIn();
  let resolve!: (result: unknown) => void;
  mocks.request.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  mocks.initial.mockResolvedValue(response);
  await mount();
  session = null;
  await update();
  expect(mocks.request.mock.calls[0][1].signal.aborted).toBe(true);
  await act(async () => resolve({ allowed: true, target: "/room/ABCDE" }));
  expect(onRoom).not.toHaveBeenCalled();
  expect(mocks.dismiss).toHaveBeenCalledOnce();
});

it("verifies taps without relying on AbortSignal.timeout, which is absent in React Native", async () => {
  const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => {
    throw new Error("Unsupported native API");
  });
  try {
    signIn();
    mocks.initial.mockResolvedValue(response);
    await mount();
    expect(onRoom).toHaveBeenCalledWith("ABCDE");
    expect(timeout).not.toHaveBeenCalled();
  } finally {
    timeout.mockRestore();
  }
});

it("suppresses foreground alerts in the open room and rechecks eligibility in the lobby", async () => {
  signIn();
  room = "ABCDE";
  await mount();
  let behavior: unknown;
  await act(async () => {
    behavior = await mocks.handler!.handleNotification(notification);
  });
  expect(behavior).toMatchObject({ shouldShowBanner: false });
  expect(mocks.request).not.toHaveBeenCalled();
  room = undefined;
  await update();
  mocks.request.mockResolvedValue({ eligible: true });
  await act(async () => {
    behavior = await mocks.handler!.handleNotification(notification);
  });
  expect(behavior).toMatchObject({ shouldShowBanner: true, shouldShowList: true });
  mocks.request.mockResolvedValue({ eligible: false });
  await act(async () => {
    behavior = await mocks.handler!.handleNotification(notification);
  });
  expect(behavior).toMatchObject({ shouldShowBanner: false });
});

it("fails closed during foreground verification when the session or open room changes", async () => {
  signIn();
  await mount();
  let resolve!: (result: unknown) => void;
  mocks.request.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const handled = mocks.handler!.handleNotification(notification);
  room = "ABCDE";
  await update();
  resolve({ eligible: true });
  expect(await handled).toMatchObject({ shouldShowBanner: false });
});
