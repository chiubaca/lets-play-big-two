import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { bigTwoGameMachine, type RoomGameState } from "@big-two/game-state-machine";
import { api } from "./api";
import { useOnlineRoom, type OnlineRoomResult } from "./use-online-room";
import { useRooms, type RoomsResult } from "./use-rooms";
import type { ChatInput, ChatMessage } from "./types";

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
const sockets: { close: ReturnType<typeof vi.fn> }[] = [];
function Harness() {
  room = useOnlineRoom({ roomId: "ABCDE" });
  rooms = useRooms();
  return null;
}
async function render() {
  await act(async () => {
    if (renderer) renderer.update(createElement(Harness));
    else renderer = create(createElement(Harness));
  });
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
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
