import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import type { RoomChatResult } from "../network";
import { ChatScreen } from "./chat";

const device = vi.hoisted(() => ({ OS: "android", width: 320, height: 568, fontScale: 1 }));
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
  Platform: device,
  StyleSheet: {
    create: (styles: unknown) => styles,
    flatten: (style: unknown) => flatten(style),
    absoluteFill: {},
  },
  useWindowDimensions: () => device,
}));
vi.mock("expo-linear-gradient", () => ({ LinearGradient: "LinearGradient" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
vi.mock("../ui/theme", () => ({ colors: {}, fonts: {}, artwork: {} }));

let renderer: ReactTestRenderer;
let chat: RoomChatResult;
const onClose = vi.fn();
const host = (type: string, label: string) =>
  renderer.root.findAll(
    (node) => node.type === type && node.props.accessibilityLabel === label,
  )[0]!;
const render = async () => {
  await act(async () => {
    const screen = createElement(ChatScreen, { visible: true, roomId: "ABCDE", chat, onClose });
    if (renderer) renderer.update(screen);
    else renderer = create(screen);
  });
};
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.assign(device, { OS: "android", width: 320, height: 568, fontScale: 1 });
  vi.clearAllMocks();
  chat = {
    messages: [
      {
        type: "message",
        id: "message-1",
        order: 1,
        clientSendId: "client-message-1",
        author: "Alex",
        role: "Player",
        text: "Hello crew",
      },
    ],
    connection: "connected",
    loading: false,
    loadingOlder: false,
    sending: false,
    hasOlder: true,
    error: null,
    refresh: vi.fn().mockResolvedValue(undefined),
    loadOlder: vi.fn().mockResolvedValue(undefined),
    send: vi.fn(),
  };
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  renderer = undefined as unknown as ReactTestRenderer;
});

it.each([1, 2])(
  "reserves error and retry space without shrinking history or hiding actions at font scale %i",
  async (fontScale) => {
    device.fontScale = fontScale;
    await render();
    const slot = renderer.root.findAll(
      (node) => String(node.type) === "View" && node.props.testID === "chat-status",
    )[0]!;
    expect(slot).toBeDefined();
    expect(flatten(slot.props.style)).toMatchObject({ height: 40 * fontScale, flexShrink: 0 });
    const statusRow = slot.parent!.parent!.parent!;
    const rowFrame = flatten(statusRow.props.style);
    const field = host("TextInput", "Chat message");
    const composer = field.parent!.parent!.parent!;
    const composerFrame = flatten(composer.props.style);
    const history = renderer.root.findAll((node) => String(node.type) === "ScrollView")[0]!;
    const historyFrame = flatten(history.props.style);
    const older = host("Pressable", "Older messages");
    const retry = host("Pressable", "Retry connection");
    const retryRegion = retry.parent!.parent!;
    expect(retry.props.disabled).toBe(true);
    expect(retryRegion.props.pointerEvents).toBe("none");
    expect(retryRegion.props.importantForAccessibility).toBe("no-hide-descendants");
    const layout = composer.children.slice();
    const longError = "Connection lost. Refresh to reconnect. ".repeat(30);
    chat = { ...chat, connection: "reconnecting", error: new Error(longError) };
    await render();
    expect(host("Pressable", "Retry connection")).toBe(retry);
    expect(retry.props.disabled).toBe(false);
    expect(retryRegion.props.pointerEvents).toBe("auto");
    expect(retryRegion.props.importantForAccessibility).toBe("auto");
    expect(flatten(retryRegion.props.style).position).not.toBe("absolute");
    const alert = renderer.root.findByProps({ accessibilityRole: "alert" });
    expect(alert.props.children).toBe(longError);
    expect(alert.props.numberOfLines).toBeUndefined();
    expect(
      slot.findAll((node) => String(node.type) === "ScrollView")[0]!.props.nestedScrollEnabled,
    ).toBe(true);
    expect(flatten(slot.props.style)).toMatchObject({ height: 40 * fontScale, flexShrink: 0 });
    expect(flatten(statusRow.props.style)).toEqual(rowFrame);
    expect(flatten(composer.props.style)).toEqual(composerFrame);
    expect(composer.children).toEqual(layout);
    expect(flatten(history.props.style)).toEqual(historyFrame);
    expect(host("TextInput", "Chat message")).toBe(field);
    expect(host("Pressable", "Older messages")).toBe(older);
    expect(older.props.disabled).toBe(false);
    await act(async () => retry.props.onPress());
    expect(chat.refresh).toHaveBeenCalledOnce();
    chat = { ...chat, error: null, connection: "connected" };
    await render();
    expect(retry.props.disabled).toBe(true);
    expect(flatten(history.props.style)).toEqual(historyFrame);
    expect(flatten(composer.props.style)).toEqual(composerFrame);
    expect(composer.children).toEqual(layout);
  },
);

it.each(["android", "ios"])("uses only one keyboard resizing mechanism on %s", async (OS) => {
  device.OS = OS;
  await render();
  const keyboard = renderer.root.findAll(
    (node) => String(node.type) === "KeyboardAvoidingView",
  )[0]!;
  expect(keyboard.props.enabled).toBe(OS === "ios");
  expect(keyboard.props.behavior).toBe(OS === "ios" ? "padding" : undefined);
  const history = renderer.root.findAll((node) => String(node.type) === "ScrollView")[0]!;
  expect(history.props.automaticallyAdjustKeyboardInsets).toBe(false);
});

it("keeps the draft, send control and history allocated while a failed message is retried", async () => {
  device.fontScale = 2;
  await render();
  const field = host("TextInput", "Chat message");
  const send = host("Pressable", "Send");
  expect(send).toBeDefined();
  const history = renderer.root.findAll((node) => String(node.type) === "ScrollView")[0]!;
  const label = send.findAll((node) => String(node.type) === "Text")[0]!;
  await act(async () => field.props.onChangeText(" Hello again "));
  const frame = flatten(send.props.style({ pressed: false }));
  let reject!: (error: Error) => void;
  chat.send = vi.fn().mockImplementation(() => new Promise((_, fail) => (reject = fail)));
  await act(async () => send.props.onPress());
  chat = { ...chat, sending: true };
  await render();
  expect(send.props.accessibilityState.busy).toBe(true);
  expect(field.props.value).toBe(" Hello again ");
  await act(async () => reject(new Error("Your message was not sent. Try again.")));
  chat = { ...chat, sending: false };
  await render();
  expect(send.findAll((node) => String(node.type) === "Text")[0]).toBe(label);
  expect(label.props.children).toBe("Send");
  expect(host("Pressable", "Retry message")).toBe(send);
  expect(flatten(send.props.style({ pressed: false }))).toEqual(frame);
  expect(field.props.value).toBe(" Hello again ");
  expect(renderer.root.findByProps({ accessibilityRole: "alert" }).props.children).toBe(
    "Your message was not sent. Try again.",
  );
  expect(renderer.root.findAll((node) => String(node.type) === "ScrollView")[0]).toBe(history);
  chat.send = vi.fn().mockResolvedValue(chat.messages[0]);
  await act(async () => send.props.onPress());
  expect(chat.send).toHaveBeenCalledWith("Hello again");
  expect(field.props.value).toBe("");
  expect(host("Pressable", "Send")).toBe(send);
  expect(renderer.root.findAllByProps({ accessibilityRole: "alert" })).toHaveLength(0);
});

it("reserves the longer connection label so reconnecting cannot rewrap the header above history", async () => {
  device.fontScale = 2;
  await render();
  const region = renderer.root.findAll(
    (node) => String(node.type) === "View" && node.props.testID === "chat-connection-status",
  )[0]!;
  expect(region).toBeDefined();
  const labels = region.findAll((node) => String(node.type) === "Text");
  const reservation = labels.find((node) => node.props.accessibilityElementsHidden)!;
  const visible = labels.find((node) => !node.props.accessibilityElementsHidden)!;
  expect(reservation.props.children).toEqual(["ABCDE", " · RECONNECTING"]);
  expect(flatten(reservation.props.style).opacity).toBe(0);
  expect(flatten(reservation.props.style).position).not.toBe("absolute");
  expect(reservation.props.importantForAccessibility).toBe("no-hide-descendants");
  expect(reservation.props.numberOfLines).toBeUndefined();
  expect(flatten(visible.props.style)).toMatchObject({ position: "absolute", left: 0, right: 0 });
  const frame = flatten(region.props.style);
  chat = { ...chat, connection: "reconnecting" };
  await render();
  expect(visible.props.children).toEqual(["ABCDE", " · ", "RECONNECTING"]);
  expect(reservation.props.children).toEqual(["ABCDE", " · RECONNECTING"]);
  expect(flatten(region.props.style)).toEqual(frame);
});
