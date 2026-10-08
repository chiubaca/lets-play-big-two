import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { bigTwoGameMachine } from "@big-two/game-state-machine";
import { GameApp } from "../App";

const state = vi.hoisted(() => ({
  offline: {} as Record<string, unknown>,
  online: {} as Record<string, unknown>,
  session: null as null | { user: { id: string; name: string } },
  pending: false,
  initialURL: null as string | null,
  getItem: vi.fn<(key: string) => Promise<string | null>>(),
}));
vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  View: "View",
  Platform: { OS: "android" },
  BackHandler: { addEventListener: () => ({ remove: vi.fn() }) },
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaProvider: "SafeAreaProvider" }));
vi.mock("expo-font", () => ({ useFonts: vi.fn() }));
vi.mock("expo-status-bar", () => ({ StatusBar: "StatusBar" }));
vi.mock("expo-splash-screen", () => ({ preventAutoHideAsync: async () => undefined }));
vi.mock("expo-linking", () => ({
  getInitialURL: async () => state.initialURL,
  addEventListener: () => ({ remove: vi.fn() }),
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: state.getItem },
}));
vi.mock("./network", () => ({
  useSession: () => ({ data: state.session, isPending: state.pending }),
  useOnlineRoom: () => state.online,
}));
vi.mock("./game", () => ({ useOfflineGame: () => state.offline, LOCAL_HUMAN_ID: "human" }));
vi.mock("./screens/home", () => ({ HomeScreen: "HomeScreen" }));
vi.mock("./screens/table", () => ({ TableScreen: "TableScreen" }));
vi.mock("./screens/auth", () => ({ AuthSheet: "AuthSheet" }));
vi.mock("./screens/profile", () => ({ ProfileScreen: "ProfileScreen" }));
vi.mock("./screens/pass-setup", () => ({ PassSetupScreen: "PassSetupScreen" }));
vi.mock("./screens/chat", () => ({ ChatScreen: "ChatScreen" }));
vi.mock("./notifications/use-turn-notifications", () => ({
  useTurnNotifications: () => ({ device: null, returning: false }),
}));
vi.mock("./notifications/turn-settings", () => ({
  TurnNotificationSettings: "TurnNotificationSettings",
}));
vi.mock("./ui/theme", () => ({ colors: { gold: "gold" } }));
vi.mock("./ui/primitives", () => ({
  Button: "Button",
  CasinoScreen: "CasinoScreen",
  ErrorMessage: "ErrorMessage",
  Label: "Label",
  Panel: "Panel",
  Sheet: "Sheet",
}));

let renderer: ReactTestRenderer;
const host = (type: string) => renderer.root.findByType(type as never);
const snapshot = bigTwoGameMachine.resolveState({
  value: "WAITING_FOR_PLAYERS",
  context: {
    players: [],
    currentPlayerIndex: 0,
    cardPile: [],
    roundMode: null,
    consecutivePasses: 0,
  },
});
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  state.getItem.mockResolvedValue(null);
  state.offline = { ready: false, snapshot: null, send: vi.fn(), redeal: vi.fn(), handCounts: {} };
  state.online = {
    gameState: null,
    refresh: vi.fn(),
    send: vi.fn(),
    chat: { loading: true, connection: "connecting", messages: [] },
  };
  state.session = null;
  state.pending = false;
  state.initialURL = null;
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  vi.clearAllMocks();
});

it("keeps the local table mounted while storage loads and a private game becomes ready", async () => {
  await act(async () => {
    renderer = create(createElement(GameApp));
  });
  await act(async () => host("HomeScreen").props.onSolo());
  const table = host("TableScreen");
  expect(table.props.snapshot).toBeUndefined();
  state.offline = { ...state.offline, ready: true, snapshot, visiblePlayerId: "human" };
  await act(async () => renderer.update(createElement(GameApp)));
  expect(host("TableScreen")).toBe(table);
  expect(table.props.snapshot.context).toBe(snapshot.context);
});

it("keeps online loading, failure, retry and a live snapshot in the same table", async () => {
  state.session = { user: { id: "human", name: "Test" } };
  await act(async () => {
    renderer = create(createElement(GameApp));
  });
  await act(async () => host("HomeScreen").props.onRoom("ABCDE"));
  const table = host("TableScreen");
  state.online = { ...state.online, error: { message: "Offline" } };
  await act(async () => renderer.update(createElement(GameApp)));
  expect(host("TableScreen")).toBe(table);
  expect(table.props.error).toBe("Offline");
  await act(async () => table.props.onRetry());
  expect(state.online.refresh).toHaveBeenCalledOnce();
  state.online = { ...state.online, gameState: snapshot, connection: "connected", error: null };
  await act(async () => renderer.update(createElement(GameApp)));
  expect(host("TableScreen")).toBe(table);
  expect(table.props.snapshot).toBe(snapshot);
});

it("uses the room shell rather than flashing the home menu while session hydration is pending", async () => {
  state.pending = true;
  state.initialURL = "bigtwocrew://room/ABCDE";
  await act(async () => {
    renderer = create(createElement(GameApp));
  });
  expect(host("TableScreen").props.roomId).toBe("ABCDE");
  expect(renderer.root.findAllByType("HomeScreen" as never)).toHaveLength(0);
  const table = host("TableScreen");
  state.pending = false;
  await act(async () => renderer.update(createElement(GameApp)));
  expect(host("TableScreen")).toBe(table);
  expect(table.props.onSignIn).toBeTypeOf("function");
  state.session = { user: { id: "human", name: "Test" } };
  await act(async () => renderer.update(createElement(GameApp)));
  expect(host("TableScreen")).toBe(table);
  expect(table.props.onSignIn).toBeUndefined();
});

it("waits for saved setup and resume availability before enabling the pass editor", async () => {
  let resolveConfig!: (value: string | null) => void;
  let resolveSaved!: (value: string | null) => void;
  state.getItem.mockImplementation(
    (key) =>
      new Promise((resolve) => {
        if (key === "big-two-native-pass-config-v1") resolveConfig = resolve;
        else resolveSaved = resolve;
      }),
  );
  await act(async () => {
    renderer = create(createElement(GameApp));
  });
  await act(async () => host("HomeScreen").props.onPassSetup());
  expect(renderer.root.findAllByType("PassSetupScreen" as never)).toHaveLength(0);
  const home = host("HomeScreen");
  const config = {
    players: [
      { name: "Alex", isBot: false },
      { name: "Jo", isBot: false },
    ],
  };
  await act(async () => resolveConfig(JSON.stringify(config)));
  expect(host("HomeScreen")).toBe(home);
  await act(async () => resolveSaved("saved-game"));
  expect(host("PassSetupScreen").props.loading).not.toBe(true);
  expect(host("PassSetupScreen").props.initialConfig).toEqual(config);
  expect(host("PassSetupScreen").props.onResume).toBeTypeOf("function");
});

it("preserves profile editor identity during a pending session recheck", async () => {
  const session = { user: { id: "human", name: "Test" } };
  state.session = session;
  await act(async () => {
    renderer = create(createElement(GameApp));
  });
  await act(async () => host("HomeScreen").props.onProfile());
  const profile = host("ProfileScreen");
  // useSession retains its confirmed data while a same-account check is pending.
  state.session = session;
  state.pending = true;
  await act(async () => renderer.update(createElement(GameApp)));
  expect(host("ProfileScreen")).toBe(profile);
  state.session = session;
  state.pending = false;
  await act(async () => renderer.update(createElement(GameApp)));
  expect(host("ProfileScreen")).toBe(profile);
  state.session = null;
  await act(async () => renderer.update(createElement(GameApp)));
  expect(renderer.root.findAllByType("ProfileScreen" as never)).toHaveLength(0);
});

it("retains an open chat and its draft identity while checking the same session", async () => {
  const session = { user: { id: "human", name: "Test" } };
  state.session = session;
  await act(async () => {
    renderer = create(createElement(GameApp));
  });
  await act(async () => host("HomeScreen").props.onRoom("ABCDE"));
  await act(async () => host("TableScreen").props.onChat());
  const chat = host("ChatScreen");
  state.session = session;
  state.pending = true;
  await act(async () => renderer.update(createElement(GameApp)));
  expect(host("ChatScreen")).toBe(chat);
  expect(chat.props.visible).toBe(true);
  state.session = session;
  state.pending = false;
  await act(async () => renderer.update(createElement(GameApp)));
  expect(host("ChatScreen")).toBe(chat);
  state.session = null;
  await act(async () => renderer.update(createElement(GameApp)));
  expect(host("ChatScreen")).not.toBe(chat);
  expect(host("ChatScreen").props.visible).toBe(false);
});
