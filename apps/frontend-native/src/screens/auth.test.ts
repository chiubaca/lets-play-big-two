import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { AuthSheet } from "./auth";

const network = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  social: vi.fn(),
  useSession: vi.fn(),
}));
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
vi.mock("../network", () => ({
  authClient: {
    useSession: network.useSession,
    signIn: { email: network.signIn, social: network.social },
    signUp: { email: network.signUp },
  },
}));
vi.mock("../network/config", () => ({ NATIVE_ORIGIN: "bigtwo://" }));
vi.mock("expo-linear-gradient", () => ({ LinearGradient: "LinearGradient" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
vi.mock("lucide-react-native", () => ({ AtSign: "AtSign", KeyRound: "KeyRound", Mail: "Mail" }));
vi.mock("react-native-svg", () => ({ default: "Svg", Path: "Path" }));
vi.mock("../ui/theme", () => ({ colors: {}, fonts: {}, artwork: {} }));

let renderer: ReactTestRenderer;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  network.useSession.mockReturnValue({ data: null });
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
});
const host = (type: string, label: string) =>
  renderer.root.findAll(
    (node) => node.type === type && node.props.accessibilityLabel === label,
  )[0]!;

it.each([1, 2])(
  "keeps sign-in actions in place through validation, busy, server error and recovery at font scale %i",
  async (fontScale) => {
    device.fontScale = fontScale;
    const onSuccess = vi.fn();
    await act(async () => {
      renderer = create(createElement(AuthSheet, { visible: true, onClose: vi.fn(), onSuccess }));
    });
    const status = renderer.root.findAll(
      (node) => String(node.type) === "View" && node.props.testID === "auth-status",
    )[0]!;
    const frame = flatten(status.props.style);
    expect(frame).toMatchObject({ height: 40 * fontScale, flexShrink: 0 });
    const signIn = host("Pressable", "Sign in");
    const google = host("Pressable", "Continue with Google");
    const body = renderer.root.findAll((node) => String(node.type) === "ScrollView")[0]!;
    const order = body.children.slice();
    await act(async () => {
      host("TextInput", "Email").props.onChangeText("invalid");
      host("TextInput", "Password").props.onChangeText("password");
    });
    await act(async () => signIn.props.onPress());
    expect(network.signIn).not.toHaveBeenCalled();
    expect(renderer.root.findByProps({ accessibilityRole: "alert" }).props.children).toBe(
      "Enter a valid email",
    );

    let resolve!: (result: unknown) => void;
    network.signIn.mockImplementation(() => new Promise((done) => (resolve = done)));
    await act(async () => host("TextInput", "Email").props.onChangeText("alex@example.com"));
    await act(async () => signIn.props.onPress());
    expect(signIn.props.accessibilityState.busy).toBe(true);
    expect(renderer.root.findAllByProps({ accessibilityRole: "alert" })).toHaveLength(0);
    const longError = "Sign-in failed. Please retry. ".repeat(30);
    await act(async () => resolve({ error: { message: longError } }));
    const alert = renderer.root.findByProps({ accessibilityRole: "alert" });
    expect(alert.props.children).toBe(longError);
    expect(alert.props.numberOfLines).toBeUndefined();
    const scroll = status.findAll((node) => String(node.type) === "ScrollView")[0]!;
    expect(scroll.props.nestedScrollEnabled).toBe(true);
    expect(scroll.props.scrollEnabled).not.toBe(false);
    expect(scroll.props.keyboardShouldPersistTaps).toBe("handled");
    expect(flatten(status.props.style)).toEqual(frame);
    expect(body.children).toEqual(order);
    expect(host("Pressable", "Continue with Google")).toBe(google);

    network.signIn.mockResolvedValue({ data: { user: { id: "alex", name: "Alex" } } });
    await act(async () => signIn.props.onPress());
    expect(onSuccess).toHaveBeenCalledWith({ id: "alex", displayName: "Alex" });
    expect(host("TextInput", "Password").props.value).toBe("");
    expect(
      renderer.root.findAll(
        (node) => String(node.type) === "View" && node.props.testID === "auth-status",
      )[0],
    ).toBe(status);
    expect(flatten(status.props.style)).toEqual(frame);
    expect(body.children).toEqual(order);
  },
);

it("clears a typed password after Google sign-in so signing out and reopening cannot restore it", async () => {
  const props = { visible: true, onClose: vi.fn(), onSuccess: vi.fn() };
  await act(async () => {
    renderer = create(createElement(AuthSheet, props));
  });
  const password = host("TextInput", "Password");
  await act(async () => password.props.onChangeText("private-password"));
  network.social.mockResolvedValue({});
  await act(async () => host("Pressable", "Continue with Google").props.onPress());
  expect(network.social).toHaveBeenCalledWith({ provider: "google", callbackURL: "bigtwo://" });
  expect(props.onSuccess).not.toHaveBeenCalled();
  network.useSession.mockReturnValue({
    data: { user: { id: "alex", name: "Alex", displayUsername: "Cardsharp" } },
  });
  await act(async () => renderer.update(createElement(AuthSheet, props)));
  expect(props.onSuccess).toHaveBeenCalledExactlyOnceWith({ id: "alex", displayName: "Cardsharp" });
  expect(password.props.value).toBe("");
  await act(async () => renderer.update(createElement(AuthSheet, { ...props, visible: false })));
  network.useSession.mockReturnValue({ data: null });
  await act(async () => renderer.update(createElement(AuthSheet, props)));
  expect(host("TextInput", "Password")).toBe(password);
  expect(password.props.value).toBe("");
  expect(password.props.secureTextEntry).toBe(true);
  expect(props.onClose).not.toHaveBeenCalled();
  expect(props.onSuccess).toHaveBeenCalledTimes(1);
});
