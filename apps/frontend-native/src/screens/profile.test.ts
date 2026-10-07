import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { ProfileScreen } from "./profile";

const network = vi.hoisted(() => ({ updateUser: vi.fn(), deleteUser: vi.fn() }));
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
vi.mock("../network/config", () => ({ NATIVE_ORIGIN: "bigtwo://" }));
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
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
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
      renderer = create(
        createElement(ProfileScreen, {
          session: { user: { id: "alex", name: "Alex", email: "alex@example.com" } },
          onHome,
        }),
      );
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
    renderer = create(
      createElement(ProfileScreen, {
        session: { user: { id: "alex", name: "Alex", email: "alex@example.com" } },
        onHome: vi.fn(),
      }),
    );
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
