import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { bigTwoGameMachine, type RoomGameState } from "@big-two/game-state-machine";
import { api } from "./api";
import { useOnlineRoom, type OnlineRoomResult } from "./use-online-room";
import { useRooms, type RoomsResult } from "./use-rooms";
import type { ChatInput, ChatMessage, CreatedRoom } from "./types";
import { NativeQueryProvider, createNativeQueryClient } from "./query-client";
import { notifyManager, onlineManager, type QueryClient } from "@tanstack/react-query";

// Mock only the raw authentication/device and transport boundaries. Both room
// hooks, the shared session hook, focus leases and socket lifecycle stay real.
const raw = vi.hoisted(() => ({
  data: null as null | { user: { id: string; name: string } },
  isPending: false,
  uuid: 0,
}));
vi.mock("better-auth/react", () => ({
  createAuthClient: () => ({ useSession: () => ({ ...raw }), getCookie: () => "session=test" }),
}));
vi.mock("better-auth/client/plugins", () => ({
  inferAdditionalFields: vi.fn(),
  usernameClient: vi.fn(),
}));
vi.mock("@better-auth/expo/client", () => ({ expoClient: vi.fn() }));
vi.mock("expo-secure-store", () => ({}));
vi.mock("expo-crypto", () => ({ randomUUID: () => `uuid-${++raw.uuid}` }));
vi.mock("react-native", () => ({
  AppState: { currentState: "active", addEventListener: () => ({ remove: vi.fn() }) },
}));
vi.mock("./use-foreground", () => ({ useForeground: () => true }));
vi.mock("./api", () => ({
  api: {
    getRoom: vi.fn(),
    listRooms: vi.fn(),
    createRoom: vi.fn(),
    action: vi.fn(),
    joinRoom: vi.fn(),
    leaveRoom: vi.fn(),
    roomFocus: vi.fn(),
    chatHistory: vi.fn(),
    sendChat: vi.fn(),
  },
}));

const viewer = { user: { id: "alex", name: "Alex" } };
const snapshot: RoomGameState = Object.assign(
  bigTwoGameMachine.resolveState({
    value: "WAITING_FOR_PLAYERS",
    context: {
      players: [{ id: "alex", name: "Alex", hand: [] }],
      currentPlayerIndex: 0,
      cardPile: [],
      roundMode: null,
      consecutivePasses: 0,
    },
  }),
  { handCounts: { alex: 0 }, spectatorCount: 0 },
);
const history: ChatMessage = {
  type: "message",
  id: "history-1",
  order: 1,
  clientSendId: "old-send",
  author: "Alex",
  role: "Player",
  text: "Hello room",
};
let renderer: ReactTestRenderer | undefined;
let room: OnlineRoomResult;
let rooms: RoomsResult;
let client: QueryClient;
const sockets: { close: ReturnType<typeof vi.fn> }[] = [];
function Harness() {
  room = useOnlineRoom({ roomId: "ABCDE" });
  rooms = useRooms();
  return null;
}
async function render() {
  await act(async () => {
    const tree = createElement(NativeQueryProvider, { client, children: createElement(Harness) });
    if (renderer) renderer.update(tree);
    else renderer = create(tree);
  });
}
beforeEach(() => {
  client = createNativeQueryClient();
  notifyManager.setScheduler(queueMicrotask);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.resetAllMocks();
  sockets.length = 0;
  raw.data = viewer;
  raw.isPending = false;
  raw.uuid = 0;
  vi.stubGlobal(
    "WebSocket",
    class {
      onopen = null;
      onmessage = null;
      onerror = null;
      onclose = null;
      close = vi.fn();
      constructor() {
        sockets.push(this);
      }
    },
  );
  vi.mocked(api.getRoom).mockResolvedValue(snapshot);
  vi.mocked(api.listRooms).mockResolvedValue({
    rooms: [{ roomId: "ABCDE", status: "waiting", playerCount: 1 }],
  });
  vi.mocked(api.chatHistory).mockResolvedValue({ messages: [history], hasMore: false });
  vi.mocked(api.roomFocus).mockResolvedValue({ ok: true });
});
afterEach(async () => {
  if (renderer) await act(async () => renderer!.unmount());
  renderer = undefined;
  client.clear();
  onlineManager.setOnline(true);
  notifyManager.setScheduler((callback) => setTimeout(callback, 0));
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("retains the confirmed player's snapshot, chat history and uncertain-send UUID through pending revalidation", async () => {
  let accepted: ChatMessage | undefined;
  const deliveries: ChatMessage[] = [];
  vi.mocked(api.sendChat).mockImplementation(async (_roomId, input: ChatInput) => {
    const existing = deliveries.find((message) => message.clientSendId === input.clientSendId);
    if (existing) return existing;
    accepted = { ...history, ...input, id: `sent-${deliveries.length}`, order: 2 };
    deliveries.push(accepted);
    throw new Error("Connection lost after the server accepted the message");
  });
  await render();
  expect(room.gameState).toBe(snapshot);
  expect(room.chat.messages).toEqual([history]);
  await act(async () => {
    await expect(room.chat.send("Hello again")).rejects.toThrow("Connection lost");
  });
  const firstSend = vi.mocked(api.sendChat).mock.calls[0]![1];
  raw.data = null;
  raw.isPending = true;
  await render();
  expect(room.gameState).toBe(snapshot);
  expect(room.role).toBe("player");
  expect(room.chat.messages).toEqual([history]);
  expect(sockets.every((socket) => socket.close.mock.calls.length > 0)).toBe(true);
  raw.data = viewer;
  raw.isPending = false;
  await render();
  await act(async () => {
    await expect(room.chat.send("Hello again")).resolves.toEqual(accepted);
  });
  expect(vi.mocked(api.sendChat).mock.calls[1]![1]).toEqual(firstSend);
  expect(deliveries).toHaveLength(1);
  expect(room.chat.messages).toEqual([history, accepted]);
});

it("blocks authenticated reads, mutations, sockets and focus heartbeats during pending, including retained callbacks", async () => {
  vi.useFakeTimers();
  await render();
  const previous = room;
  const focusCalls = vi.mocked(api.roomFocus).mock.calls.length;
  raw.data = null;
  raw.isPending = true;
  await render();
  const reads = vi.mocked(api.getRoom).mock.calls.length;
  const chatReads = vi.mocked(api.chatHistory).mock.calls.length;
  const socketCount = sockets.length;
  await act(async () => {
    for (const callbacks of [room, previous]) {
      await callbacks.refresh();
      await callbacks.chat.refresh();
      await callbacks.chat.loadOlder();
      await expect(callbacks.send({ type: "START_GAME" })).rejects.toThrow();
      await expect(callbacks.join()).rejects.toThrow();
      await expect(callbacks.leave()).rejects.toThrow();
      await expect(callbacks.chat.send("Do not send")).rejects.toThrow();
    }
    vi.advanceTimersByTime(30_000);
  });
  expect(api.getRoom).toHaveBeenCalledTimes(reads);
  expect(api.chatHistory).toHaveBeenCalledTimes(chatReads);
  expect(api.roomFocus).toHaveBeenCalledTimes(focusCalls);
  expect(sockets).toHaveLength(socketCount);
  expect(api.action).not.toHaveBeenCalled();
  expect(api.joinRoom).not.toHaveBeenCalled();
  expect(api.leaveRoom).not.toHaveBeenCalled();
  expect(api.sendChat).not.toHaveBeenCalled();
});

it("also retains lobby data without allowing pending lobby requests or retained mutation callbacks", async () => {
  await render();
  const previous = rooms;
  raw.data = null;
  raw.isPending = true;
  await render();
  expect(rooms.rooms).toEqual([{ roomId: "ABCDE", status: "waiting", playerCount: 1 }]);
  const reads = vi.mocked(api.listRooms).mock.calls.length;
  await act(async () => {
    for (const callbacks of [rooms, previous]) {
      await callbacks.refresh();
      await expect(callbacks.createRoom()).rejects.toThrow();
      await expect(callbacks.joinRoom("ABCDE")).rejects.toThrow();
      await expect(callbacks.leaveRoom("ABCDE")).rejects.toThrow();
    }
  });
  expect(api.listRooms).toHaveBeenCalledTimes(reads);
  expect(api.createRoom).not.toHaveBeenCalled();
  expect(api.joinRoom).not.toHaveBeenCalled();
  expect(api.leaveRoom).not.toHaveBeenCalled();
});

it("shares the authenticated lobby read between concurrent consumers", async () => {
  let second!: RoomsResult;
  function LobbyConsumers() {
    rooms = useRooms();
    second = useRooms();
    return null;
  }
  await act(async () => {
    renderer = create(
      createElement(NativeQueryProvider, { client, children: createElement(LobbyConsumers) }),
    );
  });
  expect(rooms.rooms).toEqual([{ roomId: "ABCDE", status: "waiting", playerCount: 1 }]);
  expect(second.rooms).toEqual(rooms.rooms);
  expect(api.listRooms).toHaveBeenCalledTimes(1);
});

it("exposes room creation progress and refreshes the lobby after confirmation", async () => {
  let confirm!: (room: CreatedRoom) => void;
  vi.mocked(api.createRoom).mockImplementation(
    () =>
      new Promise((resolve) => {
        confirm = resolve;
      }),
  );
  await render();
  expect(rooms.creating).toBe(false);
  let creation!: Promise<CreatedRoom>;
  await act(async () => {
    creation = rooms.createRoom();
  });
  expect(rooms.creating).toBe(true);
  vi.mocked(api.listRooms).mockResolvedValue({
    rooms: [{ roomId: "NEW01", status: "waiting", playerCount: 1 }],
  });
  await act(async () => {
    confirm({ roomId: "NEW01", roomCode: "NEW01", status: "waiting" });
    await creation;
  });
  expect(rooms.creating).toBe(false);
  expect(rooms.rooms).toEqual([{ roomId: "NEW01", status: "waiting", playerCount: 1 }]);
});

it("joining a table updates both the spectator view and a mounted lobby", async () => {
  vi.mocked(api.getRoom).mockResolvedValue({
    ...snapshot,
    context: { ...snapshot.context, players: [] },
    handCounts: {},
    spectatorCount: 1,
  });
  vi.mocked(api.listRooms).mockResolvedValue({ rooms: [] });
  await render();
  expect(room.role).toBe("spectator");
  vi.mocked(api.getRoom).mockResolvedValue(snapshot);
  vi.mocked(api.listRooms).mockResolvedValue({
    rooms: [{ roomId: "ABCDE", status: "waiting", playerCount: 1 }],
  });
  await act(async () => {
    await room.join();
  });
  expect(room.role).toBe("player");
  expect(rooms.rooms).toEqual([{ roomId: "ABCDE", status: "waiting", playerCount: 1 }]);
});

it("shares an authenticated room snapshot between concurrent consumers", async () => {
  let second!: OnlineRoomResult;
  function RoomConsumers() {
    room = useOnlineRoom({ roomId: "ABCDE" });
    second = useOnlineRoom({ roomId: "ABCDE" });
    return null;
  }
  await act(async () => {
    renderer = create(
      createElement(NativeQueryProvider, { client, children: createElement(RoomConsumers) }),
    );
  });
  expect(room.role).toBe("player");
  expect(second.gameState).toEqual(room.gameState);
  expect(api.getRoom).toHaveBeenCalledTimes(1);
});

it("shares chat history across simultaneous visits to the same authenticated room", async () => {
  let second!: OnlineRoomResult;
  function RoomConsumers() {
    room = useOnlineRoom({ roomId: "ABCDE" });
    second = useOnlineRoom({ roomId: "ABCDE" });
    return null;
  }
  await act(async () => {
    renderer = create(
      createElement(NativeQueryProvider, { client, children: createElement(RoomConsumers) }),
    );
  });
  expect(room.chat.messages).toEqual([history]);
  expect(second.chat.messages).toEqual(room.chat.messages);
  expect(api.chatHistory).toHaveBeenCalledOnce();
});

it("keeps live messages and redactions when an older chat page finishes late", async () => {
  vi.mocked(api.chatHistory).mockResolvedValue({
    messages: [{ ...history, id: "message-4", order: 4 }],
    hasMore: true,
  });
  await render();
  let finish!: (page: { messages: ChatMessage[]; hasMore: boolean }) => void;
  vi.mocked(api.chatHistory).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  let older!: Promise<void>;
  await act(async () => {
    older = room.chat.loadOlder();
  });
  expect(room.chat.loadingOlder).toBe(true);
  const socket = sockets[1] as unknown as { onmessage: (event: { data: string }) => void };
  await act(async () => {
    socket.onmessage({
      data: JSON.stringify({
        ...history,
        type: "redaction",
        id: "history-1",
        author: "Deleted participant",
        role: null,
        text: "Message removed",
      }),
    });
    socket.onmessage({
      data: JSON.stringify({ ...history, id: "message-5", order: 5, text: "New live message" }),
    });
  });
  await act(async () => {
    finish({ messages: [history], hasMore: false });
    await older;
  });
  expect(room.chat.messages.map(({ id, author, text }) => ({ id, author, text }))).toEqual([
    { id: "history-1", author: "Deleted participant", text: "Message removed" },
    { id: "message-4", author: "Alex", text: "Hello room" },
    { id: "message-5", author: "Alex", text: "New live message" },
  ]);
  expect(room.chat.hasOlder).toBe(false);
});

it("uses the server page boundary even when a redaction arrives for an unloaded older message", async () => {
  vi.mocked(api.chatHistory).mockResolvedValue({
    messages: [{ ...history, id: "message-4", order: 4 }],
    hasMore: true,
  });
  await render();
  const socket = sockets[1] as unknown as { onmessage: (event: { data: string }) => void };
  await act(async () =>
    socket.onmessage({
      data: JSON.stringify({
        ...history,
        type: "redaction",
        author: "Deleted participant",
        role: null,
        text: "Message removed",
      }),
    }),
  );
  const cursors: (number | undefined)[] = [];
  vi.mocked(api.chatHistory).mockImplementation(async (_room, cursor) => {
    cursors.push(cursor?.before);
    return {
      messages: [
        { ...history, id: "message-3", order: 3 },
        { ...history, id: "message-2", order: 2 },
      ],
      hasMore: false,
    };
  });
  await act(async () => {
    await room.chat.loadOlder();
  });
  expect(cursors).toEqual([4]);
  expect(room.chat.messages.map((message) => message.order)).toEqual([1, 2, 3, 4]);
});

it("rebuilds chat on reconnect and catches up every missed page without resurrecting deleted authors", async () => {
  await render();
  const cursors: (number | undefined)[] = [];
  vi.mocked(api.chatHistory).mockImplementation(async (_room, cursor) => {
    cursors.push(cursor?.after);
    if (!cursor)
      return {
        messages: [
          { ...history, author: "Deleted participant", role: null, text: "Message removed" },
        ],
        hasMore: false,
      };
    if (cursor.after === 1)
      return {
        messages: [{ ...history, id: "message-2", order: 2, text: "First missed message" }],
        hasMore: true,
      };
    return {
      messages: [{ ...history, id: "message-3", order: 3, text: "Second missed message" }],
      hasMore: false,
    };
  });
  await act(async () => {
    await room.chat.refresh();
  });
  expect(cursors).toEqual([undefined, 1, 2]);
  expect(room.chat.messages.map(({ author, text }) => ({ author, text }))).toEqual([
    { author: "Deleted participant", text: "Message removed" },
    { author: "Alex", text: "First missed message" },
    { author: "Alex", text: "Second missed message" },
  ]);
});

it("rejects an offline chat send without replaying it and retains its draft for explicit retry", async () => {
  await render();
  onlineManager.setOnline(false);
  await act(async () => {
    await expect(room.chat.send("Keep this draft")).rejects.toThrow("offline");
  });
  expect(room.chat.sending).toBe(false);
  await act(async () => {
    onlineManager.setOnline(true);
  });
  expect(api.sendChat).not.toHaveBeenCalled();
  vi.mocked(api.sendChat).mockImplementation(async (_room, input) => ({
    ...history,
    ...input,
    id: "sent-2",
    order: 2,
  }));
  await act(async () => {
    await room.chat.send("Keep this draft");
  });
  expect(room.chat.messages.map((message) => message.text)).toEqual([
    "Hello room",
    "Keep this draft",
  ]);
});

it("keeps a newer live room snapshot when an older HTTP response arrives late", async () => {
  let finish!: (value: RoomGameState) => void;
  vi.mocked(api.getRoom).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await render();
  const live = {
    value: "WAITING_FOR_PLAYERS",
    context: {
      ...snapshot.context,
      players: [
        { id: "alex", name: "Alex", hand: [] },
        { id: "jo", name: "Jo", hand: [] },
      ],
    },
    handCounts: { alex: 0, jo: 0 },
    spectatorCount: 0,
  };
  const socket = sockets[0] as unknown as { onmessage: (event: { data: string }) => void };
  await act(async () => {
    socket.onmessage({ data: JSON.stringify(live) });
  });
  await act(async () => {
    finish(snapshot);
  });
  expect(room.gameState?.context.players.map((player) => player.id)).toEqual(["alex", "jo"]);
});

it("reports online action progress until the authoritative refresh completes", async () => {
  await render();
  let confirmAction!: (result: { success: true }) => void;
  let confirmRead!: (result: RoomGameState) => void;
  vi.mocked(api.action).mockImplementation(
    () =>
      new Promise((resolve) => {
        confirmAction = resolve;
      }),
  );
  vi.mocked(api.getRoom).mockImplementation(
    () =>
      new Promise((resolve) => {
        confirmRead = resolve;
      }),
  );
  expect(room.acting).toBe(false);
  let sending!: Promise<void>;
  await act(async () => {
    sending = room.send({ type: "START_GAME" });
  });
  expect(room.acting).toBe(true);
  expect(room.gameState).toBe(snapshot);
  await act(async () => {
    confirmAction({ success: true });
  });
  expect(room.acting).toBe(true);
  await act(async () => {
    confirmRead(snapshot);
    await sending;
  });
  expect(room.acting).toBe(false);
});

it("rejects an offline turn immediately and never replays it after reconnection", async () => {
  await render();
  onlineManager.setOnline(false);
  await act(async () => {
    await expect(room.send({ type: "PASS_TURN", playerId: "alex" })).rejects.toThrow("offline");
    onlineManager.setOnline(true);
  });
  expect(api.action).not.toHaveBeenCalled();
  expect(room.acting).toBe(false);
});

it("clears private state and the retry UUID on confirmed sign-out, even when the same account returns", async () => {
  vi.mocked(api.sendChat).mockRejectedValue(new Error("Uncertain delivery"));
  await render();
  const previous = room;
  await act(async () => {
    await expect(room.chat.send("Private draft")).rejects.toThrow("Uncertain delivery");
  });
  const firstSend = vi.mocked(api.sendChat).mock.calls[0]![1];
  raw.data = null;
  await render();
  expect(room.gameState === undefined).toBe(true);
  expect(room.role).toBeNull();
  expect(room.chat.messages).toEqual([]);
  expect(rooms.rooms).toEqual([]);
  await expect(previous.join()).rejects.toThrow();
  await expect(previous.chat.send("Private draft")).rejects.toThrow();

  // A new authenticated visit must not briefly show cached private data before
  // fresh responses arrive, even when its account ID matches the old visit.
  vi.mocked(api.getRoom).mockImplementation(() => new Promise(() => {}));
  vi.mocked(api.chatHistory).mockImplementation(() => new Promise(() => {}));
  vi.mocked(api.listRooms).mockImplementation(() => new Promise(() => {}));
  raw.data = viewer;
  await render();
  expect(room.gameState === undefined).toBe(true);
  expect(room.chat.messages).toEqual([]);
  expect(rooms.rooms).toEqual([]);
  await act(async () => {
    await expect(room.chat.send("Private draft")).rejects.toThrow("Uncertain delivery");
  });
  expect(vi.mocked(api.sendChat).mock.calls[1]![1].clientSendId).not.toBe(firstSend.clientSendId);
});

it.each([false, true])(
  "never exposes the old account when another account appears (pending=%s)",
  async (isPending) => {
    await render();
    const previous = room;
    vi.mocked(api.getRoom).mockImplementation(() => new Promise(() => {}));
    vi.mocked(api.chatHistory).mockImplementation(() => new Promise(() => {}));
    vi.mocked(api.listRooms).mockImplementation(() => new Promise(() => {}));
    raw.data = { user: { id: "jo", name: "Jo" } };
    raw.isPending = isPending;
    await render();
    expect(room.gameState === undefined).toBe(true);
    expect(room.role).toBeNull();
    expect(room.chat.messages).toEqual([]);
    expect(rooms.rooms).toEqual([]);
    await expect(previous.join()).rejects.toThrow();
    await expect(previous.chat.send("Old account draft")).rejects.toThrow();
    raw.data = null;
    raw.isPending = true;
    await render();
    expect(room.gameState === undefined).toBe(true);
    expect(room.chat.messages).toEqual([]);
  },
);

it("does not authenticate an initial pending session or open its network transports", async () => {
  raw.isPending = true;
  await render();
  expect(room.gameState === undefined).toBe(true);
  expect(room.chat.messages).toEqual([]);
  expect(rooms.rooms).toEqual([]);
  expect(sockets).toHaveLength(0);
  expect(api.getRoom).not.toHaveBeenCalled();
  expect(api.chatHistory).not.toHaveBeenCalled();
  expect(api.listRooms).not.toHaveBeenCalled();
  expect(api.roomFocus).not.toHaveBeenCalled();
});

it("discards a late send response from before sign-out even if the same account has signed in again", async () => {
  let confirm!: (message: ChatMessage) => void;
  vi.mocked(api.sendChat).mockImplementation(
    () =>
      new Promise((resolve) => {
        confirm = resolve;
      }),
  );
  await render();
  let send!: Promise<ChatMessage>;
  await act(async () => {
    send = room.chat.send("Old private message");
  });
  raw.data = null;
  await render();
  vi.mocked(api.getRoom).mockImplementation(() => new Promise(() => {}));
  vi.mocked(api.chatHistory).mockImplementation(() => new Promise(() => {}));
  raw.data = viewer;
  await render();
  await act(async () => {
    confirm({ ...history, text: "Old private message", id: "late-send", order: 2 });
    await send;
  });
  expect(room.chat.messages).toEqual([]);
});

it("does not publish a late send into a later visit to the same room", async () => {
  let visiting = "ABCDE";
  function VisitHarness() {
    room = useOnlineRoom({ roomId: visiting });
    return null;
  }
  const visit = () =>
    createElement(NativeQueryProvider, { client, children: createElement(VisitHarness) });
  await act(async () => {
    renderer = create(visit());
  });
  let confirm!: (message: ChatMessage) => void;
  vi.mocked(api.sendChat).mockImplementation(
    () =>
      new Promise((resolve) => {
        confirm = resolve;
      }),
  );
  const earlier = room.chat;
  let sending!: Promise<ChatMessage>;
  await act(async () => {
    sending = earlier.send("Earlier visit");
  });
  visiting = "FGHIJ";
  await act(async () => {
    renderer!.update(visit());
  });
  visiting = "ABCDE";
  await act(async () => {
    renderer!.update(visit());
  });
  expect(room.chat.messages).toEqual([history]);
  await act(async () => {
    confirm({ ...history, id: "earlier-visit", order: 2, text: "Earlier visit" });
    await sending;
  });
  expect(room.chat.messages).toEqual([history]);
  await expect(earlier.send("Stale callback")).rejects.toThrow();
});

it("does not repopulate private chat after its room screen unmounts", async () => {
  let visible = true;
  function RoomScreen() {
    room = useOnlineRoom({ roomId: "ABCDE" });
    return null;
  }
  const screen = () =>
    createElement(NativeQueryProvider, {
      client,
      children: visible ? createElement(RoomScreen) : null,
    });
  await act(async () => {
    renderer = create(screen());
  });
  let confirm!: (message: ChatMessage) => void;
  vi.mocked(api.sendChat).mockImplementation(
    () =>
      new Promise((resolve) => {
        confirm = resolve;
      }),
  );
  const previous = room.chat;
  let sending!: Promise<ChatMessage>;
  await act(async () => {
    sending = previous.send("Old screen");
  });
  visible = false;
  await act(async () => {
    renderer!.update(screen());
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await act(async () => {
    confirm({ ...history, id: "old-screen", order: 2, text: "Old screen" });
    await sending;
  });
  vi.mocked(api.chatHistory).mockImplementation(() => new Promise(() => {}));
  visible = true;
  await act(async () => {
    renderer!.update(screen());
  });
  expect(room.chat.messages).toEqual([]);
  await expect(previous.send("Old screen callback")).rejects.toThrow();
});
