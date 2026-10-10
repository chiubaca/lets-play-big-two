import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { ProfileScreen } from "./profile";
import { NativeQueryProvider, createNativeQueryClient } from "../network/query-client";
import { notifyManager, onlineManager, type QueryClient } from "@tanstack/react-query";

const network = vi.hoisted(() => ({ updateUser: vi.fn(), deleteUser: vi.fn() }));
const auth = vi.hoisted(() => ({
  isPending: false,
  data: { user: { id: "alex", name: "Alex", email: "alex@example.com" } },
}));
vi.mock("../network/auth-client", () => ({ useSession: () => auth }));
const device = vi.hoisted(() => ({ width: 320, height: 568, fontScale: 1 }));
const flatten = (style: unknown): Record<string, unknown> =>
  Array.isArray(style)
    ? Object.assign({}, ...style.map(flatten))
    : ((style ?? {}) as Record<string, unknown>);
vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Image: "Image",
  KeyboardAvoidingView: "KeyboardAvoidingView",
  Modal: "Modal",
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  Text: "Text",
  TextInput: "TextInput",
  View: "View",
  Platform: { OS: "android" },
  StyleSheet: {
    create: (styles: unknown) => styles,
    flatten: (style: unknown) => flatten(style),
    absoluteFill: {},
  },
  useWindowDimensions: () => device,
}));
vi.mock("../network", () => ({ authClient: network }));
vi.mock("../network/config", () => ({
  NATIVE_ORIGIN: "bigtwo://",
  BACKEND_URL: "https://api.example.com",
}));
vi.mock("expo-linear-gradient", () => ({ LinearGradient: "LinearGradient" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
vi.mock("lucide-react-native", () => ({
  AtSign: "AtSign",
  KeyRound: "KeyRound",
  Mail: "Mail",
  ChevronDown: "ChevronDown",
  Pencil: "Pencil",
}));
vi.mock("react-native-svg", () => ({ default: "Svg", Path: "Path" }));
vi.mock("../ui/theme", () => ({ colors: {}, fonts: {}, artwork: {} }));

let renderer: ReactTestRenderer;
let client: QueryClient;
function profile(onHome = vi.fn()) {
  return createElement(NativeQueryProvider, {
    client,
    children: createElement(ProfileScreen, { session: auth.data, onHome }),
  });
}
const host = (type: string, label: string) =>
  renderer.root.findAll(
    (node) => node.type === type && node.props.accessibilityLabel === label,
  )[0]!;
const status = () =>
  renderer.root.findAll(
    (node) => String(node.type) === "View" && node.props.testID === "profile-editor-status",
  )[0]!;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  auth.isPending = false;
  client = createNativeQueryClient();
  notifyManager.setScheduler(queueMicrotask);
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  client.clear();
  onlineManager.setOnline(true);
  notifyManager.setScheduler((callback) => setTimeout(callback, 0));
});

it.each([
  ["name", 1],
  ["name", 2],
  ["emoji", 1],
  ["emoji", 2],
  ["delete", 1],
  ["delete", 2],
] as const)(
  "keeps %s editor actions allocated through errors and recovery at font scale %i",
  async (editor, fontScale) => {
    device.fontScale = fontScale;
    const onHome = vi.fn();
    await act(async () => {
      renderer = create(profile(onHome));
    });
    const open =
      editor === "name"
        ? "Edit username, currently Alex"
        : editor === "emoji"
          ? "Edit profile emoji"
          : "Account & data deletion";
    await act(async () => host("Pressable", open).props.onPress());
    const slot = status();
    const frame = flatten(slot.props.style);
    expect(frame).toMatchObject({ height: 40 * fontScale, flexShrink: 0 });
    const action = host("Pressable", editor === "delete" ? "Delete account" : "Save changes");
    const cancel = host("Pressable", "Cancel");
    const actions = action.parent!;
    const actionFrame = flatten(actions.props.style);
    if (editor === "name") {
      await act(async () => host("TextInput", "Username").props.onChangeText("a"));
      await act(async () => action.props.onPress());
      expect(network.updateUser).not.toHaveBeenCalled();
      expect(renderer.root.findByProps({ accessibilityRole: "alert" }).props.children).toBe(
        "Use 3–30 characters for your username.",
      );
      expect(status()).toBe(slot);
      expect(flatten(slot.props.style)).toEqual(frame);
      await act(async () => host("TextInput", "Username").props.onChangeText("Cardsharp"));
    } else if (editor === "emoji") {
      await act(async () => host("Pressable", "Choose 🏆").props.onPress());
    } else {
      await act(async () =>
        host("TextInput", "Type DELETE to confirm account deletion").props.onChangeText("DELETE"),
      );
    }
    const request = editor === "delete" ? network.deleteUser : network.updateUser;
    let resolve!: (result: unknown) => void;
    request.mockImplementation(() => new Promise((done) => (resolve = done)));
    await act(async () => action.props.onPress());
    expect(action.props.accessibilityState.busy).toBe(true);
    expect(cancel.props.disabled).toBe(true);
    const longError = "Could not update your account. Try again. ".repeat(30);
    await act(async () => resolve({ error: { message: longError } }));
    const alert = renderer.root.findByProps({ accessibilityRole: "alert" });
    expect(alert.props.children).toBe(longError);
    expect(alert.props.numberOfLines).toBeUndefined();
    expect(
      slot.findAll((node) => String(node.type) === "ScrollView")[0]!.props.nestedScrollEnabled,
    ).toBe(true);
    expect(status()).toBe(slot);
    expect(flatten(slot.props.style)).toEqual(frame);
    expect(flatten(actions.props.style)).toEqual(actionFrame);
    expect(host("Pressable", "Cancel")).toBe(cancel);
    expect(cancel.props.disabled).toBe(false);
    expect(onHome).not.toHaveBeenCalled();
    request.mockResolvedValue({});
    await act(async () => action.props.onPress());
    expect(renderer.root.findAllByProps({ accessibilityRole: "alert" })).toHaveLength(0);
    expect(status()).toBe(slot);
    expect(flatten(slot.props.style)).toEqual(frame);
  },
);

it("does not move account controls when a profile save succeeds or a new editor clears the notice", async () => {
  device.fontScale = 2;
  await act(async () => {
    renderer = create(profile());
  });
  const notice = renderer.root.findAll(
    (node) => String(node.type) === "View" && node.props.testID === "profile-notice",
  )[0]!;
  expect(notice).toBeDefined();
  expect(flatten(notice.props.style)).toMatchObject({ width: "100%", height: 80, flexShrink: 0 });
  const content = notice.parent!.parent!;
  const order = content.children.slice();
  const deletion = host("Pressable", "Account & data deletion");
  await act(async () => host("Pressable", "Edit profile emoji").props.onPress());
  await act(async () => host("Pressable", "Choose 🏆").props.onPress());
  network.updateUser.mockResolvedValue({});
  await act(async () => host("Pressable", "Save changes").props.onPress());
  const text = notice.findAll((node) => String(node.type) === "Text")[0]!;
  expect(text.props.children).toBe("Profile updated!");
  expect(text.props.accessibilityLiveRegion).toBe("polite");
  expect(content.children).toEqual(order);
  expect(host("Pressable", "Account & data deletion")).toBe(deletion);
  await act(async () => host("Pressable", "Edit profile emoji").props.onPress());
  expect(notice.findAll((node) => String(node.type) === "Text")).toHaveLength(0);
  expect(content.children).toEqual(order);
});

it("keeps profile edits unsaved and does not replay them when submitted offline", async () => {
  await act(async () => {
    renderer = create(profile());
  });
  await act(async () => host("Pressable", "Edit profile emoji").props.onPress());
  await act(async () => host("Pressable", "Choose 🏆").props.onPress());
  onlineManager.setOnline(false);
  await act(async () => host("Pressable", "Save changes").props.onPress());
  expect(renderer.root.findByProps({ accessibilityRole: "alert" }).props.children).toContain(
    "offline",
  );
  await act(async () => {
    onlineManager.setOnline(true);
  });
  expect(network.updateUser).not.toHaveBeenCalled();
  expect(host("Pressable", "Save changes").props.disabled).toBe(false);
});

it("blocks account deletion during session confirmation even with DELETE entered", async () => {
  const onHome = vi.fn();
  await act(async () => {
    renderer = create(profile(onHome));
  });
  await act(async () => host("Pressable", "Account & data deletion").props.onPress());
  await act(async () =>
    host("TextInput", "Type DELETE to confirm account deletion").props.onChangeText("DELETE"),
  );
  auth.isPending = true;
  await act(async () => {
    renderer.update(profile(onHome));
  });
  await act(async () => host("Pressable", "Delete account").props.onPress());
  expect(network.deleteUser).not.toHaveBeenCalled();
  expect(onHome).not.toHaveBeenCalled();
  expect(renderer.root.findByProps({ accessibilityRole: "alert" }).props.children).toContain(
    "confirmed",
  );
});

it("does not navigate a later screen when account deletion completes after leaving the profile", async () => {
  const onHome = vi.fn();
  let confirm!: (result: unknown) => void;
  network.deleteUser.mockImplementation(
    () =>
      new Promise((resolve) => {
        confirm = resolve;
      }),
  );
  await act(async () => {
    renderer = create(profile(onHome));
  });
  await act(async () => host("Pressable", "Account & data deletion").props.onPress());
  await act(async () =>
    host("TextInput", "Type DELETE to confirm account deletion").props.onChangeText("DELETE"),
  );
  await act(async () => host("Pressable", "Delete account").props.onPress());
  await act(async () => renderer.unmount());
  await act(async () => confirm({}));
  expect(onHome).not.toHaveBeenCalled();
});
