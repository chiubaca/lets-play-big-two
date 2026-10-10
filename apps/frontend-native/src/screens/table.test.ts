import { createElement, type ComponentProps } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { bigTwoGameMachine } from "@big-two/game-state-machine";
import { TableScreen } from "./table";
import { createRoomFixture } from "../storybook/room-fixtures";

const viewport = vi.hoisted(() => ({ width: 393, height: 852 }));
vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  Pressable: "Pressable",
  ActivityIndicator: "ActivityIndicator",
  ScrollView: "ScrollView",
  Image: "Image",
  Modal: "Modal",
  Switch: "Switch",
  Platform: { OS: "android" },
  Share: { share: vi.fn() },
  StyleSheet: {
    create: (styles: unknown) => styles,
    flatten: (style: unknown): Record<string, unknown> =>
      Array.isArray(style)
        ? Object.assign(
            {},
            ...style.map((entry) => (entry && typeof entry === "object" ? entry : {})),
          )
        : ((style ?? {}) as Record<string, unknown>),
  },
  useWindowDimensions: () => viewport,
  AppState: { addEventListener: () => ({ remove: vi.fn() }) },
}));
vi.mock("expo-linear-gradient", () => ({ LinearGradient: "LinearGradient" }));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: async () => null },
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: "SafeAreaView",
  useSafeAreaInsets: () => ({ left: 0, right: 0, top: 24, bottom: 24 }),
}));
vi.mock("lucide-react-native", () => ({
  Menu: "Menu",
  Settings: "Settings",
  CircleHelp: "CircleHelp",
  Smartphone: "Smartphone",
  Share2: "Share2",
  MessageCircle: "MessageCircle",
  Eye: "Eye",
}));
vi.mock("expo-haptics", () => ({ selectionAsync: vi.fn() }));
vi.mock("../ui/primitives", () => ({
  CasinoScreen: "CasinoScreen",
  Label: "Label",
  Button: "Button",
  ErrorMessage: "ErrorMessage",
  Sheet: "Sheet",
  styles: { row: { flexDirection: "row" } },
}));
vi.mock("../ui/cards", () => ({
  Hand: "Hand",
  PlayingCard: "PlayingCard",
  CardBack: "CardBack",
  CardBacks: "CardBacks",
  CardSuit: "CardSuit",
}));
vi.mock("../ui/table-surface", () => ({ TableSurface: "TableSurface" }));
vi.mock("../ui/card-pile", () => ({ CardPile: "CardPile" }));
vi.mock("../ui/theme", () => ({
  artwork: {},
  colors: { gold: "gold", cream: "cream", muted: "muted" },
  fonts: { body: "Inter", strong: "InterSemiBold", display: "Fraunces", mono: "IBMPlexMono" },
}));
vi.mock("./rules", () => ({ RulesSheet: "RulesSheet" }));

let renderer: ReactTestRenderer;
const send = vi.fn();
const flatten = (style: unknown): Record<string, unknown> =>
  Array.isArray(style)
    ? Object.assign({}, ...style.map(flatten))
    : ((style ?? {}) as Record<string, unknown>);
const ancestors = (node: ReactTestInstance) => {
  const result: ReactTestInstance[] = [];
  for (let parent = node.parent; parent; parent = parent.parent) result.push(parent);
  return result;
};
const mount = async (viewer = "host", playerCount = 3) => {
  const players = Array.from({ length: playerCount }, (_, index) => ({
    id: index ? `bot-${index}` : "host",
    name: index ? `Bot ${index}` : "Test player",
    hand: [],
    isBot: index > 0,
  }));
  const snapshot = bigTwoGameMachine.resolveState({
    value: "WAITING_FOR_PLAYERS",
    context: {
      players,
      currentPlayerIndex: 0,
      cardPile: [],
      roundMode: null,
      consecutivePasses: 0,
    },
  });
  await act(async () => {
    renderer = create(
      createElement(TableScreen, {
        snapshot,
        userId: viewer,
        mode: "online",
        roomId: "ABCDE",
        send,
        onHome: vi.fn(),
      }),
    );
  });
};

describe("native room chat notification", () => {
  it.each([1, 9, 10, 99])("does not clip the unread badge for %i messages", async (chatUnread) => {
    await mount();
    const props = renderer.root.findByType(TableScreen).props as ComponentProps<typeof TableScreen>;
    const onChat = vi.fn();
    await act(async () =>
      renderer.update(createElement(TableScreen, { ...props, chatUnread, onChat })),
    );
    const chat = renderer.root.findByProps({ title: "Room chat" });
    expect(chat.props.accessibilityLabel).toBe(`Room chat, ${chatUnread} unread`);
    const badge = chat.props.icon.props.children[1];
    expect(badge.props.children).toBe(chatUnread > 9 ? "9+" : chatUnread);
    // Exercise the real Button style composition, not the mocked Button's defaults.
    const { Button } = await vi.importActual<typeof import("../ui/primitives")>("../ui/primitives");
    const button = Button(chat.props as ComponentProps<typeof Button>);
    const style = flatten(button.props.style({ pressed: false }));
    // The badge overhangs the circular face, so rectangular containment is not enough.
    expect(style.overflow).toBe("visible");
    await act(async () => chat.props.onPress());
    expect(onChat).toHaveBeenCalledOnce();
  });
});

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.assign(viewport, { width: 393, height: 852 });
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  vi.clearAllMocks();
});

describe("native waiting table", () => {
  it("does not pull the waiting title above the scroll viewport", async () => {
    await mount();
    const title = renderer.root.findByProps({
      children: "Waiting for players · 3 of 4 seats filled",
    });
    for (const ancestor of ancestors(title)) {
      expect(Number(flatten(ancestor.props.style).marginTop ?? 0)).toBeGreaterThanOrEqual(0);
      expect(
        Number(flatten(ancestor.props.contentContainerStyle).marginTop ?? 0),
      ).toBeGreaterThanOrEqual(0);
    }
  });

  it.each([
    [320, 568],
    [393, 852],
    [852, 393],
  ])("keeps seats and controls in normal flow at %i × %i", async (width, height) => {
    Object.assign(viewport, { width, height });
    await mount();
    const action = renderer.root.findByProps({ title: "Fill with bots" });
    const seat = renderer.root.findByProps({ accessibilityLabel: "Bot 1, 0 cards" });
    for (const node of [action, seat]) {
      for (const ancestor of ancestors(node)) {
        expect(flatten(ancestor.props.style).position).not.toBe("absolute");
      }
    }
    const scroll = renderer.root.findByProps({ showsVerticalScrollIndicator: false });
    expect(flatten(scroll.props.contentContainerStyle).flexGrow).toBe(1);
    const surface = renderer.root.findByProps({ height: 0 });
    expect(surface.props.width).toBe(width > height ? width * 0.69 : width - 16);
  });

  it("preserves host actions and spectator joining", async () => {
    await mount();
    await act(async () => renderer.root.findByProps({ title: "Fill with bots" }).props.onPress());
    expect(send).toHaveBeenCalledWith({ type: "FILL_WITH_BOTS" });
    expect(renderer.root.findByProps({ title: "Deal Cards" }).props.disabled).toBe(false);
    await act(async () => renderer.unmount());
    await mount("spectator");
    expect(renderer.root.findAllByProps({ title: "Fill with bots" })).toHaveLength(0);
    await act(async () => renderer.root.findByProps({ title: "Join Table" }).props.onPress());
    expect(send).toHaveBeenCalledWith({
      type: "JOIN_GAME",
      playerId: "spectator",
      playerName: "Player",
    });
  });

  it("matches the web's compact body-text buttons and hides bot filling for a full table", async () => {
    await mount("host", 4);
    expect(renderer.root.findAllByProps({ title: "Fill with bots" })).toHaveLength(0);
    const deal = renderer.root.findByProps({ title: "Deal Cards" });
    expect(flatten(deal.props.labelStyle).fontFamily).toBe("Inter");
    expect(flatten(deal.props.style).borderRadius).toBe(10);
    expect(deal.props.gold).toBeUndefined();
    await act(async () => renderer.unmount());
    await mount("spectator", 4);
    expect(renderer.root.findAllByProps({ title: "Join Table" })).toHaveLength(0);
    expect(
      renderer.root.findByProps({ children: "All seats are taken · watching the table" }),
    ).toBeDefined();
  });

  it("does not enable dealing with only one player", async () => {
    await mount("host", 1);
    expect(renderer.root.findByProps({ title: "Deal Cards" }).props.disabled).toBe(true);
  });
});

describe("native table transition geometry", () => {
  it.each([
    [320, 568],
    [393, 852],
    [852, 393],
  ])("keeps win and loss results above the cards at %i × %i", async (width, height) => {
    Object.assign(viewport, { width, height });
    for (const scenario of ["host-wins", "guest-wins"] as const) {
      await act(async () => {
        renderer = create(
          createElement(TableScreen, {
            snapshot: createRoomFixture(scenario),
            userId: "host",
            mode: "online",
            send,
            onHome: vi.fn(),
          }),
        );
      });
      const finish = renderer.root.findByProps({ title: "Results" }).parent!;
      const board = renderer.root.findByProps({ testID: "table-board" });
      expect(finish.parent).toBe(board);
      const pileLayer = renderer.root.findByType("CardPile" as never).parent!;
      const handLayer = renderer.root.findByType("Hand" as never).parent!;
      for (const layer of [pileLayer, handLayer, ...board.children]) {
        if (typeof layer === "string" || layer === finish) continue;
        expect(Number(flatten(finish.props.style).zIndex ?? 0)).toBeGreaterThan(
          Number(flatten(layer.props.style).zIndex ?? 0),
        );
      }
      await act(async () => renderer.unmount());
    }
  });

  it("bounds short-landscape scrolling controls without stealing board width", async () => {
    Object.assign(viewport, { width: 568, height: 320 });
    await mount();
    const controls = ancestors(renderer.root.findByProps({ title: "Play" })).find(
      (node) => String(node.type) === "ScrollView" && flatten(node.props.style).width,
    );
    expect(controls).toBeDefined();
    expect(flatten(controls!.props.style)).toMatchObject({
      flexGrow: 0,
      flexShrink: 0,
      width: 568 * 0.25,
      alignSelf: "stretch",
    });
    expect(controls!.props.keyboardShouldPersistTaps).toBe("handled");
  });

  it("retains the measured table shell through loading, failure, retry and ready", async () => {
    await mount();
    const props = renderer.root.findByType(TableScreen).props as ComponentProps<typeof TableScreen>;
    const readySnapshot = props.snapshot;
    const retry = vi.fn();
    const surface = () => renderer.root.findByType("TableSurface" as never);
    await act(async () =>
      renderer.update(
        createElement(TableScreen, { ...props, snapshot: undefined, onRetry: retry }),
      ),
    );
    const initialSurface = surface();
    const board = flatten(initialSurface.parent!.props.style);
    await act(async () =>
      initialSurface.parent!.props.onLayout({
        nativeEvent: { layout: { width: 377, height: 600 } },
      }),
    );
    for (const error of ["Could not connect", null]) {
      await act(async () =>
        renderer.update(
          createElement(TableScreen, { ...props, snapshot: undefined, error, onRetry: retry }),
        ),
      );
      expect(flatten(surface().parent!.props.style)).toEqual(board);
      expect(surface().props.height).toBe(600);
      if (error)
        await act(async () => renderer.root.findByProps({ title: "Retry" }).props.onPress());
      expect(renderer.root.findAllByType("Hand" as never)).toHaveLength(0);
      const actions = renderer.root.findByProps({ title: "Play" }).parent!;
      expect(actions.props.importantForAccessibility).toBe("no-hide-descendants");
      expect(actions.props.pointerEvents).toBe("none");
    }
    expect(retry).toHaveBeenCalledOnce();
    await act(async () =>
      renderer.update(createElement(TableScreen, { ...props, snapshot: readySnapshot })),
    );
    expect(surface()).toBe(initialSurface);
    expect(surface().props.height).toBe(600);
    expect(flatten(surface().parent!.props.style)).toEqual(board);
  });

  it.each([
    [320, 568],
    [393, 852],
    [852, 393],
  ])(
    "keeps the board and action allocation stable through deal, reconnect and finish at %i × %i",
    async (width, height) => {
      Object.assign(viewport, { width, height });
      await mount();
      const component = renderer.root.findByType(TableScreen);
      const props = component.props as ComponentProps<typeof TableScreen>;
      const surface = () => renderer.root.findByType("TableSurface" as never);
      const boardStyle = () => flatten(surface().parent!.props.style);
      const initialBoard = boardStyle();
      const initialActions = renderer.root.findAllByProps({ title: "Play" });
      expect(initialActions).toHaveLength(1);
      for (const value of ["ROUND_FIRST_MOVE", "GAME_END"] as const) {
        const snapshot = bigTwoGameMachine.resolveState({
          value,
          context: props.snapshot!.context,
        });
        await act(async () => renderer.update(createElement(TableScreen, { ...props, snapshot })));
        expect(boardStyle()).toEqual(initialBoard);
        expect(renderer.root.findAllByProps({ title: "Play" })).toHaveLength(1);
      }
      await act(async () =>
        renderer.update(
          createElement(TableScreen, {
            ...props,
            connected: false,
            error: "Connection interrupted",
          }),
        ),
      );
      expect(boardStyle()).toEqual(initialBoard);
      const status = renderer.root.findByProps({ children: "RECONNECTING…" });
      expect(
        [status, ...ancestors(status)].some(
          (node) => flatten(node.props.style).position === "absolute",
        ),
      ).toBe(true);
      const notice = renderer.root.findByProps({ message: "Connection interrupted" });
      expect(
        ancestors(notice).some((node) => flatten(node.props.style).position === "absolute"),
      ).toBe(true);
    },
  );
});
