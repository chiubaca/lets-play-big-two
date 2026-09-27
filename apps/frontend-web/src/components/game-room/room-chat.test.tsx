// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { RoomChat } from "./room-chat";

const send = vi.fn();
class ChatSocket {
  static connections: ChatSocket[] = [];
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(public url: string) {
    ChatSocket.connections.push(this);
  }
  close() {}
  receive(message: object) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

afterEach(() => {
  cleanup();
  send.mockReset();
  ChatSocket.connections = [];
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function show(seated = true, blocked = false) {
  vi.stubEnv("VITE_BACKEND_URL", "https://api.example.com");
  vi.stubGlobal("WebSocket", ChatSocket);
  return render(<RoomChat roomId="ABCDE" seated={seated} blocked={blocked} send={send} />);
}

const message = {
  type: "message",
  id: "ABCDE:1",
  order: 1,
  clientSendId: "abc",
  author: "<Mina>",
  text: "**hello** https://example.com",
};

it("receives while closed, announces a count, opens a literal live log, and returns focus on Escape", () => {
  show();
  expect(ChatSocket.connections[0].url).toBe("wss://api.example.com/api/room/chat/ws/ABCDE");
  expect(screen.queryByRole("log")).toBeNull();
  act(() => ChatSocket.connections[0].receive(message));
  const trigger = screen.getByRole("button", { name: /Room chat, 1 unread/ });
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(trigger);
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByRole("log", { name: "Room messages" }).textContent).toContain(
    "<Mina> **hello** https://example.com",
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
  fireEvent.click(screen.getByRole("button", { name: "Room chat" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Room chat message" }), {
    target: { value: message.text },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  act(() => ChatSocket.connections[0].receive(message));
  await act(async () => resolve(message));
  expect(screen.getByRole("log").querySelectorAll(".room-chat-entry")).toHaveLength(1);
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
  send.mockRejectedValueOnce(new Error("Please try again"));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "keep this" } });
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Please try again"));
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("keep this");
});

it("counts messages blocked by a modal and changes between read-only and composer without losing the draft", () => {
  const view = show(true, true);
  fireEvent.click(screen.getByRole("button", { name: "Room chat" }));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "unsent" } });
  act(() => ChatSocket.connections[0].receive(message));
  expect(screen.getByRole("button", { name: /1 unread/ })).toBeTruthy();
  view.rerender(<RoomChat roomId="ABCDE" seated={false} blocked={false} send={send} />);
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.getByText(/only seated Players can send/)).toBeTruthy();
  view.rerender(<RoomChat roomId="ABCDE" seated blocked={false} send={send} />);
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("unsent");
});

it("keeps only witnessed messages on reconnect and starts empty in a fresh tab", async () => {
  vi.useFakeTimers();
  try {
    const view = show(false);
    act(() => ChatSocket.connections[0].receive(message));
    fireEvent.click(screen.getByRole("button", { name: /1 unread/ }));
    expect(screen.getByRole("log").textContent).toContain(message.text);
    act(() => ChatSocket.connections[0].onclose?.());
    expect(screen.getByText("Chat reconnecting…")).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(ChatSocket.connections).toHaveLength(2);
    expect(screen.getByRole("log").querySelectorAll(".room-chat-entry")).toHaveLength(1);
    view.unmount();
    show(false);
    fireEvent.click(screen.getByRole("button", { name: "Room chat" }));
    expect(screen.getByRole("log").querySelectorAll(".room-chat-entry")).toHaveLength(0);
    expect(send).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});
