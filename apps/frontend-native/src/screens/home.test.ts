import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { HomeScreen, type HomeScreenProps } from "./home";
import type { RoomsResult } from "../network/use-rooms";

const network = vi.hoisted(() => ({ useRooms: vi.fn(), signOut: vi.fn() }));
const viewport = vi.hoisted(() => ({ width: 393, height: 852, fontScale: 1 }));
const flatten = (style: unknown): Record<string, unknown> =>
  Array.isArray(style)
    ? Object.assign({}, ...style.map(flatten))
    : ((style ?? {}) as Record<string, unknown>);
vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  Pressable: "Pressable",
  TextInput: "TextInput",
  Image: "Image",
  ScrollView: "ScrollView",
  Modal: "Modal",
  KeyboardAvoidingView: "KeyboardAvoidingView",
  ActivityIndicator: "ActivityIndicator",
  Platform: { OS: "android" },
  StyleSheet: {
    create: (styles: unknown) => styles,
    flatten: (style: unknown): Record<string, unknown> =>
      Array.isArray(style)
        ? Object.assign({}, ...style.filter(Boolean))
        : ((style ?? {}) as Record<string, unknown>),
    absoluteFill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  },
  useWindowDimensions: () => viewport,
}));
vi.mock("../network", () => ({
  useRooms: network.useRooms,
  authClient: { signOut: network.signOut },
}));
vi.mock("expo-linear-gradient", () => ({ LinearGradient: "LinearGradient" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
vi.mock("lucide-react-native", () => ({
  ArrowRight: "ArrowRight",
  Bot: "Bot",
  LogIn: "LogIn",
  UsersRound: "UsersRound",
  Wifi: "Wifi",
}));
vi.mock("../ui/theme", () => ({
  colors: { gold: "gold", muted: "muted", line: "line" },
  fonts: { mono: "mono" },
  artwork: {},
}));
vi.mock("./profile", () => ({ MembershipCard: "MembershipCard" }));
vi.mock("../ui/home-scroll-scene", async () => {
  const { createElement: element } = await import("react");
  return {
    HomeScrollScene: ({ nav, children }: { nav: React.ReactNode; children: React.ReactNode }) =>
      element("HomeScrollScene", null, nav, children),
  };
});

let renderer: ReactTestRenderer;
let rooms: RoomsResult;
const onRoom = vi.fn();
const props: HomeScreenProps = {
  session: { user: { id: "member", name: "Alex", email: "alex@example.com" } },
  pending: false,
  onSolo: vi.fn(),
  onPassSetup: vi.fn(),
  onRoom,
  onProfile: vi.fn(),
  onAuth: vi.fn(),
};
const render = async (overrides: Partial<HomeScreenProps> = {}) => {
  await act(async () => {
    const screen = createElement(HomeScreen, { ...props, ...overrides });
    if (renderer) renderer.update(screen);
    else renderer = create(screen);
  });
};
const row = (roomId: string) =>
  renderer.root.findByProps({ accessibilityLabel: `Open table ${roomId}, 2 of 4 players` });
const statusSlot = (testID: string) =>
  renderer.root.find((node) => String(node.type) === "View" && node.props.testID === testID);

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.assign(viewport, { width: 393, height: 852, fontScale: 1 });
  rooms = {
    rooms: [{ roomId: "ABCDE", status: "waiting", playerCount: 2 }],
    loading: false,
    error: null,
    refresh: vi.fn().mockResolvedValue(undefined),
    createRoom: vi.fn(),
    joinRoom: vi.fn(),
    leaveRoom: vi.fn(),
  };
  network.useRooms.mockImplementation(() => rooms);
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  renderer = undefined as unknown as ReactTestRenderer;
  vi.clearAllMocks();
});

describe("home asynchronous layout", () => {
  it("keeps the multiplayer form allocated while membership resolves, including the guest result", async () => {
    rooms = { ...rooms, rooms: [], loading: true };
    await render({ session: null, pending: true });
    const code = renderer.root.findByProps({ accessibilityLabel: "Room code" });
    const join = renderer.root.findByProps({ accessibilityLabel: "Join →" });
    expect(code.props.editable).toBe(false);
    expect(join.props.disabled).toBe(true);
    await render();
    expect(renderer.root.findByProps({ accessibilityLabel: "Room code" })).toBe(code);
    expect(renderer.root.findByProps({ accessibilityLabel: "Join →" })).toBe(join);
    await render({ session: null });
    expect(renderer.root.findByProps({ accessibilityLabel: "Room code" })).toBe(code);
    expect(renderer.root.findByProps({ accessibilityLabel: "Join →" })).toBe(join);
  });

  it("uses one bounded, font-scaled status slot for loading, empty and error instead of inserting retry UI", async () => {
    rooms = { ...rooms, rooms: [], loading: true };
    await render();
    const status = statusSlot("home-tables-status");
    const retry = renderer.root.findByProps({ accessibilityLabel: "Try again" });
    expect(retry.props.disabled).toBe(true);
    expect(flatten(status.props.style)).toMatchObject({ height: 40, flexShrink: 0 });
    rooms = { ...rooms, loading: false };
    await render();
    expect(statusSlot("home-tables-status")).toBe(status);
    rooms = { ...rooms, error: new Error("Unable to load tables. Please try again.") };
    viewport.fontScale = 2;
    await render();
    expect(renderer.root.findByProps({ accessibilityLabel: "Try again" })).toBe(retry);
    expect(retry.props.disabled).toBe(false);
    expect(renderer.root.findAllByProps({ children: "No tables yet" })).toHaveLength(0);
    expect(flatten(status.props.style).height).toBe(80);
  });

  it.each([1, 2])(
    "keeps saved-table allocation bounded through long refresh errors at font scale %i",
    async (fontScale) => {
      Object.assign(viewport, { width: 320, fontScale });
      await render();
      const cached = row("ABCDE");
      const status = statusSlot("home-tables-status");
      const error =
        "The connection was interrupted. Please check your network and try again. ".repeat(12);
      for (const update of [
        { loading: true, error: null },
        { loading: false, error: new Error(error) },
        { loading: false, error: null },
      ]) {
        rooms = { ...rooms, ...update };
        await render();
        expect(statusSlot("home-tables-status")).toBe(status);
        expect(flatten(status.props.style)).toMatchObject({
          height: fontScale === 1 ? 40 : 80,
          flexShrink: 0,
        });
        expect(row("ABCDE")).toBe(cached);
        const scroll = status.find((node) => String(node.type) === "ScrollView");
        expect(flatten(scroll.props.style)).toMatchObject({ flex: 1, minHeight: 0 });
        expect(scroll.props.nestedScrollEnabled).toBe(true);
        if (update.error) {
          const alert = scroll.findByProps({ accessibilityRole: "alert" });
          expect(alert.props.children).toBe(error);
          expect(alert.props.numberOfLines).toBeUndefined();
          expect(scroll.findByProps({ accessibilityLabel: "Try again" }).props.disabled).toBe(
            false,
          );
        }
      }
    },
  );

  it("keeps cached tables mounted and tappable during refresh and after a refresh error", async () => {
    await render();
    const cached = row("ABCDE");
    rooms = { ...rooms, loading: true };
    await render();
    expect(row("ABCDE")).toBe(cached);
    rooms = { ...rooms, loading: false, error: new Error("Connection interrupted") };
    await render();
    expect(row("ABCDE")).toBe(cached);
    await act(async () => row("ABCDE").props.onPress());
    expect(onRoom).toHaveBeenCalledWith("ABCDE");
    expect(renderer.root.findByProps({ accessibilityRole: "alert" }).props.children).toBe(
      "Connection interrupted",
    );
    await act(async () =>
      renderer.root.findByProps({ accessibilityLabel: "Try again" }).props.onPress(),
    );
    expect(rooms.refresh).toHaveBeenCalledOnce();
  });

  it("bounds validation and long create errors above the table heading without replacing rows", async () => {
    Object.assign(viewport, { width: 320, fontScale: 2 });
    const error = "Unable to create a room. Please check your network and try again. ".repeat(12);
    rooms = { ...rooms, createRoom: vi.fn().mockRejectedValue(new Error(error)) };
    await render();
    const cached = row("ABCDE");
    const status = statusSlot("home-room-action-status");
    expect(flatten(status.props.style)).toMatchObject({ height: 80, flexShrink: 0 });
    await act(async () =>
      renderer.root.findByProps({ accessibilityLabel: "Join →" }).props.onPress(),
    );
    expect(status.findByProps({ accessibilityRole: "alert" }).props.children).toBe(
      "Enter the room code from your friend.",
    );
    await act(async () =>
      renderer.root.findByProps({ accessibilityLabel: "＋ Create room" }).props.onPress(),
    );
    const scroll = status.find((node) => String(node.type) === "ScrollView");
    expect(scroll.props.nestedScrollEnabled).toBe(true);
    expect(scroll.findByProps({ accessibilityRole: "alert" }).props.children).toBe(error);
    expect(row("ABCDE")).toBe(cached);
    await act(async () =>
      renderer.root.findByProps({ accessibilityLabel: "Room code" }).props.onChangeText("ABCDE"),
    );
    expect(status.findAllByProps({ accessibilityRole: "alert" })).toHaveLength(0);
    expect(statusSlot("home-room-action-status")).toBe(status);
    expect(flatten(status.props.style).height).toBe(80);
    expect(row("ABCDE")).toBe(cached);
  });

  it("retains the known member and tables during session revalidation, but clears them on sign-out", async () => {
    await render();
    const cached = row("ABCDE");
    // The shared session/room hooks retain confirmed data during revalidation.
    await render({ pending: true });
    expect(row("ABCDE")).toBe(cached);
    expect(
      renderer.root.findByProps({ accessibilityLabel: "Open account menu for Alex" }),
    ).toBeDefined();
    await render({ session: null, pending: false });
    expect(
      renderer.root.findAllByProps({ accessibilityLabel: "Open table ABCDE, 2 of 4 players" }),
    ).toHaveLength(0);
    expect(
      renderer.root.findAllByProps({ accessibilityLabel: "Open account menu for Alex" }),
    ).toHaveLength(0);
  });

  it("does not resurrect a prior account when pending identity has been cleared", async () => {
    await render();
    await render({ session: null, pending: true });
    expect(
      renderer.root.findAllByProps({ accessibilityLabel: "Open account menu for Alex" }),
    ).toHaveLength(0);
    expect(
      renderer.root.findAllByProps({ accessibilityLabel: "Open table ABCDE, 2 of 4 players" }),
    ).toHaveLength(0);
  });

  it("reserves just one natural room row while the first list loads, with no fixed height", async () => {
    rooms = { ...rooms, rooms: [], loading: true };
    Object.assign(viewport, { width: 320, fontScale: 2 });
    await render();
    const placeholder = renderer.root.findByProps({ testID: "home-table-placeholder" });
    const allocation = flatten(placeholder.props.style);
    expect(allocation.height).toBeUndefined();
    expect(allocation.maxHeight).toBeUndefined();
    expect(allocation.minHeight).toBe(65);
    rooms = {
      ...rooms,
      loading: false,
      rooms: [{ roomId: "ABCDE", status: "waiting", playerCount: 2 }],
    };
    await render();
    expect(flatten(row("ABCDE").props.style)).toEqual(allocation);
    expect(renderer.root.findAllByProps({ testID: "home-table-placeholder" })).toHaveLength(0);
  });
});
