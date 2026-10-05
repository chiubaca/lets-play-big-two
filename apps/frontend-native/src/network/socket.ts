import { apiUrl, authenticatedHeaders } from "./request";
import type { ConnectionStatus } from "./types";

export interface RoomSocket {
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
  close: () => void;
}
export type SocketFactory = (url: string, headers: Record<string, string>) => RoomSocket;

export function socketUrl(baseURL: string, path: string): string {
  const url = new URL(apiUrl(baseURL, path));
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export function reconnectDelay(attempt: number, random = Math.random()): number {
  return Math.round(
    Math.min(30_000, 1_000 * 2 ** Math.min(Math.max(attempt, 0), 5)) * (0.8 + 0.4 * random),
  );
}

export function connectSocket({
  baseURL,
  path,
  origin,
  getCookie,
  createSocket,
  onStatus,
  onOpen,
  onMessage,
}: {
  baseURL: string;
  path: string;
  origin: string;
  getCookie: () => string | Promise<string>;
  createSocket: SocketFactory;
  onStatus: (status: ConnectionStatus) => void;
  onOpen?: () => void;
  onMessage: (data: unknown) => void;
}): () => void {
  const url = socketUrl(baseURL, path);
  let disposed = false;
  let generation = 0;
  let attempt = 0;
  let discardSocket: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let handshake: ReturnType<typeof setTimeout> | undefined;

  const connect = async () => {
    if (disposed) return;
    const current = ++generation;
    onStatus(attempt === 0 ? "connecting" : "reconnecting");
    let failed = false;
    let discard: (() => void) | undefined;
    const retry = () => {
      if (disposed || current !== generation || failed) return;
      failed = true;
      clearTimeout(handshake);
      discard?.();
      if (discardSocket === discard) discardSocket = undefined;
      onStatus("reconnecting");
      timer = setTimeout(() => void connect(), reconnectDelay(attempt++));
    };
    try {
      // Re-read the official bridge for every reconnect; sessions can refresh.
      const cookie = await getCookie();
      if (disposed || current !== generation) return;
      const socket = createSocket(
        url,
        Object.fromEntries(authenticatedHeaders(cookie, origin).entries()),
      );
      const detach = () => {
        socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
      };
      let discarded = false;
      discard = () => {
        if (discarded) return;
        discarded = true;
        socket.onmessage = socket.onerror = null;
        // Android's native close can be a no-op during the handshake. Keep a
        // close-only open handler until this exact connector opens or closes.
        socket.onopen = () => {
          detach();
          socket.close();
        };
        socket.onclose = detach;
        socket.close();
      };
      discardSocket = discard;
      handshake = setTimeout(retry, 15_000);
      socket.onopen = () => {
        if (disposed || failed || current !== generation) {
          detach();
          socket.close();
          return;
        }
        clearTimeout(handshake);
        attempt = 0;
        onStatus("connected");
        onOpen?.();
      };
      socket.onmessage = (event) => {
        if (!disposed && !failed && current === generation) onMessage(event.data);
      };
      socket.onerror = retry;
      socket.onclose = () => {
        retry();
        detach();
      };
    } catch {
      retry();
    }
  };
  void connect();
  return () => {
    disposed = true;
    ++generation;
    clearTimeout(timer);
    clearTimeout(handshake);
    discardSocket?.();
    discardSocket = undefined;
  };
}

export function parseSocketJSON(data: unknown): unknown {
  if (typeof data !== "string") return undefined;
  try {
    return JSON.parse(data);
  } catch {
    return undefined;
  }
}
