import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { TurnNotificationSettings } from "./turn-settings";
import type { TurnDevice } from "./turn-device";

vi.mock("react-native", () => ({
  View: "View",
  Switch: "Switch",
  Linking: { openSettings: vi.fn(async () => {}) },
}));
vi.mock("../network/use-foreground", () => ({ useForeground: () => true }));
vi.mock("../ui/primitives", () => ({
  Label: "Label",
  Button: "Button",
  ErrorMessage: "ErrorMessage",
  styles: { row: {} },
}));
vi.mock("../ui/theme", () => ({ colors: {} }));
let renderer: ReactTestRenderer;
const makeDevice = () => ({
  preference: vi.fn(async () => ({ enabled: true })),
  setPreference: vi.fn(async (enabled: boolean) => ({ enabled })),
  inspect: vi.fn<TurnDevice["inspect"]>(async () => ({ state: "not-enabled", generation: 4 })),
  enable: vi.fn<TurnDevice["enable"]>(async () => {}),
  remove: vi.fn(async () => {}),
  refreshToken: vi.fn(async () => {}),
});
let device: ReturnType<typeof makeDevice>;
const button = (title: string) => renderer.root.findByProps({ title });
const mount = async () => {
  await act(async () => {
    renderer = create(createElement(TurnNotificationSettings, { device }));
  });
};
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  device = makeDevice();
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
});

it("does not enroll on mount or account-on and explicitly enables with the inspected generation", async () => {
  await mount();
  expect(device.enable).not.toHaveBeenCalled();
  await act(async () =>
    renderer.root
      .findByProps({ accessibilityLabel: "Turn notifications for my account" })
      .props.onValueChange(true),
  );
  expect(device.setPreference).toHaveBeenCalledWith(true);
  expect(device.enable).not.toHaveBeenCalled();
  vi.mocked(device.inspect).mockResolvedValue({ state: "ready", generation: 4, removable: true });
  await act(async () => button("Enable notifications on this device").props.onPress());
  expect(device.enable).toHaveBeenCalledWith(4);
  expect(button("Turn off notifications on this device")).toBeDefined();
});

it("retains enrollment errors after authoritative refresh rather than falsely reporting Ready", async () => {
  await mount();
  vi.mocked(device.enable).mockRejectedValue(new Error("Device enrollment failed"));
  await act(async () => button("Enable notifications on this device").props.onPress());
  expect(renderer.root.findByProps({ message: "Device enrollment failed" })).toBeDefined();
  expect(
    renderer.root.findAllByProps({ title: "Turn off notifications on this device" }),
  ).toHaveLength(0);
  expect(button("Check notification settings again")).toBeDefined();
});

it("keeps blocked registrations removable and offers system permission recovery", async () => {
  vi.mocked(device.inspect).mockResolvedValue({ state: "blocked", generation: 4, removable: true });
  await mount();
  expect(button("Open system settings")).toBeDefined();
  await act(async () => button("Turn off notifications on this device").props.onPress());
  expect(device.remove).toHaveBeenCalledOnce();
});
