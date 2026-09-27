// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { RoomChat } from "./room-chat";

const send = vi.fn();
const playSound = vi.fn();
class ChatSocket {
  static connections: ChatSocket[] = [];
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onopen: (() => void) | null = null;
  constructor(public url: string) {
    ChatSocket.connections.push(this);
  }
  close() {}
  receive(message: object) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}
const fetchHistory = vi.fn();

afterEach(() => {
  cleanup();
  send.mockReset();
  playSound.mockReset();
  ChatSocket.connections = [];
  fetchHistory.mockReset();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function show(blocked = false) {
  vi.stubEnv("VITE_BACKEND_URL", "https://api.example.com");
  vi.stubGlobal("WebSocket", ChatSocket);
  vi.stubGlobal("fetch", fetchHistory);
  fetchHistory.mockResolvedValue({
    ok: true,
    json: async () => ({ messages: [], hasMore: false }),
  });
  return render(<RoomChat roomId="ABCDE" blocked={blocked} send={send} playSound={playSound} />);
}

async function ready() {
  await act(async () => {
    ChatSocket.connections.at(-1)?.onopen?.();
    await Promise.resolve();
  });
  expect(fetchHistory).toHaveBeenCalled();
}

const message = {
  type: "message",
  id: "ABCDE:1",
  order: 1,
  clientSendId: "abc",
  author: "<Mina>",
  role: "Spectator" as const,
  text: "**hello** https://example.com",
};

it("receives while closed, announces a count, opens a literal live log, and returns focus on Escape", async () => {
  show();
  await ready();
  expect(ChatSocket.connections[0].url).toBe("wss://api.example.com/api/room/chat/ws/ABCDE");
  expect(screen.queryByRole("log")).toBeNull();
  act(() => ChatSocket.connections[0].receive(message));
  expect(playSound).toHaveBeenCalledExactlyOnceWith("chat-receive");
  const trigger = screen.getByRole("button", { name: /Room chat, 1 unread/ });
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(trigger);
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByRole("log", { name: "Room messages" }).textContent).toContain(
    "<Mina> · Spectator **hello** https://example.com",
  );
  expect(screen.queryByRole("link", { name: /example.com/ })).toBeNull();
  fireEvent.keyDown(screen.getByRole("log"), { key: "Escape" });
  expect(screen.queryByRole("log")).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it("merges socket echo and HTTP acknowledgement into one entry and preserves failed drafts", async () => {
  let resolve!: (value: typeof message) => void;
  send.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  show();
  await ready();
  fireEvent.click(screen.getByRole("button", { name: "Room chat" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Room chat message" }), {
    target: { value: message.text },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  const clientSendId = send.mock.calls[0][0].clientSendId;
  const ownMessage = { ...message, clientSendId };
  act(() => ChatSocket.connections[0].receive(ownMessage));
  expect(playSound).not.toHaveBeenCalled();
  await act(async () => resolve(ownMessage));
  expect(playSound).toHaveBeenCalledExactlyOnceWith("chat-send");
  expect(screen.getByRole("log").querySelectorAll(".room-chat-entry")).toHaveLength(1);
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
  send.mockRejectedValueOnce(new Error("Please try again"));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "keep this" } });
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Please try again"));
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("keep this");
  expect(playSound).toHaveBeenCalledTimes(1);
  const retryId = send.mock.calls[1][0].clientSendId;
  send.mockResolvedValueOnce({ ...message, id: "ABCDE:2", clientSendId: retryId });
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  await waitFor(() => expect(send).toHaveBeenCalledTimes(3));
  expect(send.mock.calls[2][0].clientSendId).toBe(retryId);
});

it("sends on Enter from the composer but keeps Shift+Enter for a newline", async () => {
  send.mockResolvedValue(message);
  show();
  await ready();
  fireEvent.click(screen.getByRole("button", { name: "Room chat" }));
  const composer = screen.getByRole("textbox", { name: "Room chat message" });
  expect(document.activeElement).toBe(composer);
  fireEvent.change(composer, { target: { value: "hello" } });
  fireEvent.keyDown(composer, { key: "Enter", shiftKey: true });
  expect(send).not.toHaveBeenCalled();
  fireEvent.change(composer, { target: { value: "hello\nthere" } });
  fireEvent.keyDown(composer, { key: "Enter", isComposing: true });
  expect(send).not.toHaveBeenCalled();
  fireEvent.keyDown(composer, { key: "Enter" });
  await waitFor(() => expect(send).toHaveBeenCalledOnce());
  expect(send).toHaveBeenCalledWith({ text: "hello\nthere", clientSendId: expect.any(String) });
  await waitFor(() => expect((composer as HTMLTextAreaElement).value).toBe(""));
});

it("counts messages blocked by a modal and keeps the composer across role changes", async () => {
  const view = show(true);
  await ready();
  fireEvent.click(screen.getByRole("button", { name: "Room chat" }));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "unsent" } });
  act(() => ChatSocket.connections[0].receive(message));
  expect(screen.getByRole("button", { name: /1 unread/ })).toBeTruthy();
  view.rerender(<RoomChat roomId="ABCDE" blocked={false} send={send} playSound={playSound} />);
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("unsent");
  view.rerender(<RoomChat roomId="ABCDE" blocked={false} send={send} playSound={playSound} />);
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("unsent");
});

it("reconciles history after reconnect without replay sounds or unread", async () => {
  vi.useFakeTimers();
  try {
    const view = show();
    await ready();
    act(() => ChatSocket.connections[0].receive(message));
    fireEvent.click(screen.getByRole("button", { name: /1 unread/ }));
    expect(screen.getByRole("log").textContent).toContain(message.text);
    act(() => ChatSocket.connections[0].onclose?.());
    expect(screen.getByText("Chat reconnecting…")).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(ChatSocket.connections).toHaveLength(2);
    fetchHistory.mockResolvedValue({
      ok: true,
      json: async () => ({
        messages: [
          { ...message, author: "Deleted participant", text: "Message removed", role: null },
        ],
        hasMore: false,
      }),
    });
    await ready();
    expect(screen.getByRole("log").textContent).toContain("Message removed");
    expect(screen.getByRole("log").textContent).not.toContain(message.text);
    view.unmount();
    expect(send).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});

it("loads older pages while live messages arrive, without treating history as unread", async () => {
  const earlier = { ...message, id: "ABCDE:1", order: 1 };
  const recent = { ...message, id: "ABCDE:2", order: 2, text: "recent" };
  show();
  fetchHistory.mockResolvedValue({
    ok: true,
    json: async () => ({ messages: [recent], hasMore: true }),
  });
  await ready();
  expect(screen.getByRole("button", { name: "Room chat" })).toBeTruthy();
  expect(playSound).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Room chat" }));
  fetchHistory.mockResolvedValue({
    ok: true,
    json: async () => ({ messages: [earlier], hasMore: false }),
  });
  fireEvent.click(screen.getByRole("button", { name: "Load older messages" }));
  act(() =>
    ChatSocket.connections[0].receive({ ...message, id: "ABCDE:3", order: 3, text: "live" }),
  );
  await waitFor(() =>
    expect(screen.getByRole("log").querySelectorAll(".room-chat-entry")).toHaveLength(3),
  );
  expect(screen.getByRole("log").textContent).toContain("recent");
  expect(screen.queryByRole("button", { name: "Load older messages" })).toBeNull();
  expect(fetchHistory.mock.calls.at(-1)?.[0].toString()).toContain("before=2");
});

it("redacts visible messages and does not restore stale text from an in-flight page", async () => {
  show();
  await ready();
  fireEvent.click(screen.getByRole("button", { name: "Room chat" }));
  act(() => ChatSocket.connections[0].receive(message));
  const redaction = {
    ...message,
    type: "redaction",
    author: "Deleted participant",
    text: "Message removed",
    role: null,
  };
  act(() => ChatSocket.connections[0].receive(redaction));
  expect(screen.getByRole("log").textContent).toContain("Message removed");
  expect(screen.getByRole("log").textContent).not.toContain(message.text);
  act(() => ChatSocket.connections[0].receive({ ...message, id: "ABCDE:2", order: 2 }));
  expect(screen.getByRole("log").querySelectorAll(".room-chat-entry")).toHaveLength(2);
});

it("holds the existing log during an outage and retries failed history without showing stale text", async () => {
  vi.useFakeTimers();
  try {
    show();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: /Room chat/ }));
    act(() => ChatSocket.connections[0].receive(message));
    act(() => ChatSocket.connections[0].onclose?.());
    expect(screen.getByRole("log").textContent).toContain(message.text);
    fetchHistory.mockRejectedValueOnce(new Error("offline"));
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    await ready();
    expect(screen.getByRole("log").textContent).not.toContain(message.text);
    expect(screen.getByRole("button", { name: "Retry history" })).toBeTruthy();
    fetchHistory.mockResolvedValue({
      ok: true,
      json: async () => ({
        messages: [
          { ...message, author: "Deleted participant", text: "Message removed", role: null },
        ],
        hasMore: false,
      }),
    });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Retry history" })));
    expect(screen.getByRole("log").textContent).toContain("Message removed");
    expect(screen.getByRole("log").textContent).not.toContain(message.text);
  } finally {
    vi.useRealTimers();
  }
});

it("recovers every missed page after a long disconnect without replay unread or sounds", async () => {
  vi.useFakeTimers();
  try {
    show();
    await ready();
    act(() => ChatSocket.connections[0].receive(message));
    act(() => ChatSocket.connections[0].onclose?.());
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    const calls: string[] = [];
    fetchHistory.mockImplementation(async (url: URL) => {
      calls.push(url.toString());
      const after = Number(url.searchParams.get("after"));
      const orders = after ? (after === 1 ? [2, 3] : [4]) : [3, 4];
      return {
        ok: true,
        json: async () => ({
          messages: orders.map((order) => ({ ...message, id: `ABCDE:${order}`, order })),
          hasMore: after === 1,
        }),
      };
    });
    playSound.mockClear();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: /Room chat/ }));
    expect(screen.getByRole("log").querySelectorAll(".room-chat-entry")).toHaveLength(3);
    expect(calls.some((url) => url.includes("after=1"))).toBe(true);
    expect(calls.some((url) => url.includes("after=3"))).toBe(true);
    expect(playSound).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});
