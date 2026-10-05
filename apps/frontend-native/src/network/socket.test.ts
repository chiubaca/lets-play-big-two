import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  connectSocket,
  parseSocketJSON,
  reconnectDelay,
  socketUrl,
  type RoomSocket,
} from "./socket";

const mockSocket = (): RoomSocket => ({
  onopen: null,
  onmessage: null,
  onerror: null,
  onclose: null,
  close: vi.fn(),
});

const connectingSocket = () => {
  let state: "connecting" | "open" | "closed" = "connecting";
  const socket: RoomSocket = {
    ...mockSocket(),
    close: vi.fn(() => {
      // Android has no native socket to close until its handshake completes.
      if (state === "open") {
        state = "closed";
        socket.onclose?.();
      }
    }),
  };
  return {
    socket,
    state: () => state,
    open: () => {
      state = "open";
      socket.onopen?.();
    },
  };
};

describe("native authenticated sockets", () => {
  afterEach(() => vi.useRealTimers());

  it("uses ws for local HTTP and wss for HTTPS, with no token in the URL", () => {
    expect(socketUrl("https://api.example.com", "/api/room/ws/ABCDE")).toBe(
      "wss://api.example.com/api/room/ws/ABCDE",
    );
    expect(socketUrl("http://192.168.1.10:8788", "/api/room/chat/ws/ABCDE")).toBe(
      "ws://192.168.1.10:8788/api/room/chat/ws/ABCDE",
    );
    expect(() => socketUrl("https://api.example.com", "//evil.example/api/ws")).toThrow();
    expect(parseSocketJSON("not JSON")).toBeUndefined();
    expect(parseSocketJSON(new ArrayBuffer(1))).toBeUndefined();
    expect(parseSocketJSON('{"value":"WAITING_FOR_PLAYERS"}')).toEqual({
      value: "WAITING_FOR_PLAYERS",
    });
  });

  it("bounds exponential retry delays and adds jitter", () => {
    expect(reconnectDelay(0, 0.5)).toBe(1000);
    expect(reconnectDelay(2, 0.5)).toBe(4000);
    expect(reconnectDelay(20, 0.5)).toBe(30000);
    expect(reconnectDelay(0, 0)).toBe(800);
    expect(reconnectDelay(0, 1)).toBe(1200);
  });

  it("refreshes cookies on reconnect, retries once per failure and stops after cleanup", async () => {
    vi.useFakeTimers();
    const sockets: RoomSocket[] = [];
    const createSocket = vi.fn(() => {
      const socket = mockSocket();
      sockets.push(socket);
      return socket;
    });
    const getCookie = vi
      .fn()
      .mockReturnValueOnce("session=first")
      .mockReturnValue("session=refreshed");
    const onStatus = vi.fn();
    const onMessage = vi.fn();
    const stop = connectSocket({
      baseURL: "https://api.example.com",
      path: "/api/room/ws/ABCDE",
      origin: "bigtwocrew://",
      getCookie,
      createSocket,
      onStatus,
      onMessage,
    });
    await Promise.resolve();
    expect(createSocket).toHaveBeenLastCalledWith("wss://api.example.com/api/room/ws/ABCDE", {
      cookie: "session=first",
      origin: "bigtwocrew://",
    });
    sockets[0].onopen?.();
    expect(onStatus).toHaveBeenLastCalledWith("connected");
    sockets[0].onmessage?.({ data: "snapshot" });
    expect(onMessage).toHaveBeenCalledWith("snapshot");
    const lateFrame = sockets[0].onmessage;
    const close = sockets[0].onclose;
    sockets[0].onerror?.();
    close?.();
    await vi.advanceTimersByTimeAsync(1201);
    expect(createSocket).toHaveBeenCalledTimes(2);
    expect(createSocket).toHaveBeenLastCalledWith(expect.any(String), {
      cookie: "session=refreshed",
      origin: "bigtwocrew://",
    });
    lateFrame?.({ data: "stale" });
    expect(onMessage).not.toHaveBeenCalledWith("stale");
    stop();
    expect(sockets[1].close).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(100000);
    expect(createSocket).toHaveBeenCalledTimes(2);
  });

  it("does not open a connection after cleanup while cookie retrieval is pending", async () => {
    let release!: (cookie: string) => void;
    const getCookie = () =>
      new Promise<string>((resolve) => {
        release = resolve;
      });
    const createSocket = vi.fn(mockSocket);
    const stop = connectSocket({
      baseURL: "https://api.example.com",
      path: "/api/room/chat/ws/ABCDE",
      origin: "bigtwocrew://",
      getCookie,
      createSocket,
      onStatus: vi.fn(),
      onMessage: vi.fn(),
    });
    stop();
    release("secret");
    await Promise.resolve();
    expect(createSocket).not.toHaveBeenCalled();
  });

  it.each(["cleanup", "timeout"] as const)(
    "closes an abandoned Android connector again on late open after %s",
    async (reason) => {
      vi.useFakeTimers();
      const abandoned = connectingSocket();
      const replacement = mockSocket();
      const createSocket = vi
        .fn()
        .mockReturnValueOnce(abandoned.socket)
        .mockReturnValue(replacement);
      const onStatus = vi.fn();
      const onOpen = vi.fn();
      const onMessage = vi.fn();
      const stop = connectSocket({
        baseURL: "https://api.example.com",
        path: "/api/room/ws/ABCDE",
        origin: "bigtwocrew://",
        getCookie: () => "session=secret",
        createSocket,
        onStatus,
        onOpen,
        onMessage,
      });
      await Promise.resolve();
      const oldMessage = abandoned.socket.onmessage;
      const oldError = abandoned.socket.onerror;
      if (reason === "cleanup") stop();
      else await vi.advanceTimersByTimeAsync(16_201);
      expect(abandoned.socket.close).toHaveBeenCalledTimes(1);
      expect(abandoned.state()).toBe("connecting");
      expect(abandoned.socket.onmessage).toBeNull();
      expect(abandoned.socket.onerror).toBeNull();
      const statusCount = onStatus.mock.calls.length;
      abandoned.open();
      expect(abandoned.socket.close).toHaveBeenCalledTimes(2);
      expect(abandoned.state()).toBe("closed");
      oldMessage?.({ data: "abandoned authenticated frame" });
      oldError?.();
      expect(onMessage).not.toHaveBeenCalled();
      expect(onOpen).not.toHaveBeenCalled();
      expect(onStatus).toHaveBeenCalledTimes(statusCount);
      expect(abandoned.socket.onopen).toBeNull();
      expect(abandoned.socket.onclose).toBeNull();
      expect(replacement.close).not.toHaveBeenCalled();
      stop();
      await vi.advanceTimersByTimeAsync(100_000);
      expect(createSocket).toHaveBeenCalledTimes(reason === "cleanup" ? 1 : 2);
    },
  );

  it("detaches the late-open guard when an abandoned connector closes without opening", async () => {
    const abandoned = connectingSocket();
    const stop = connectSocket({
      baseURL: "https://api.example.com",
      path: "/api/room/ws/ABCDE",
      origin: "bigtwocrew://",
      getCookie: () => "session=secret",
      createSocket: () => abandoned.socket,
      onStatus: vi.fn(),
      onMessage: vi.fn(),
    });
    await Promise.resolve();
    stop();
    expect(abandoned.socket.onopen).not.toBeNull();
    abandoned.socket.onclose?.();
    expect(abandoned.socket.onopen).toBeNull();
    expect(abandoned.socket.onclose).toBeNull();
    expect(abandoned.socket.close).toHaveBeenCalledTimes(1);
  });

  it("times out a stalled handshake and retries a synchronous socket failure", async () => {
    vi.useFakeTimers();
    const socket = mockSocket();
    const createSocket = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("offline");
      })
      .mockReturnValue(socket);
    const stop = connectSocket({
      baseURL: "https://api.example.com",
      path: "/api/room/ws/ABCDE",
      origin: "bigtwocrew://",
      getCookie: () => "secret",
      createSocket,
      onStatus: vi.fn(),
      onMessage: vi.fn(),
    });
    await vi.advanceTimersByTimeAsync(1201);
    expect(createSocket).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(15000);
    expect(socket.close).toHaveBeenCalled();
    stop();
  });
});
