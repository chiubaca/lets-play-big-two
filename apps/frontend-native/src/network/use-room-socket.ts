import { useEffect, useRef, useState } from "react";
import { authClient } from "./auth-client";
import { BACKEND_URL, NATIVE_ORIGIN } from "./config";
import { connectSocket, type RoomSocket, type SocketFactory } from "./socket";
import type { ConnectionStatus } from "./types";

// RN's native constructor has a third headers argument, unlike browser WebSocket.
type NativeSocketConstructor = new (
  url: string,
  protocols: string[] | undefined,
  options: { headers: Record<string, string> },
) => RoomSocket;
const createSocket: SocketFactory = (url, headers) =>
  new (WebSocket as unknown as NativeSocketConstructor)(url, undefined, { headers });

export function useRoomSocket({
  path,
  viewerId,
  enabled,
  onOpen,
  onMessage,
}: {
  path: string;
  viewerId?: string;
  enabled: boolean;
  onOpen?: () => void;
  onMessage: (data: unknown) => void;
}): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const callbacks = useRef({ onOpen, onMessage });
  callbacks.current = { onOpen, onMessage };
  useEffect(() => {
    if (!enabled || !viewerId) {
      setStatus("idle");
      return;
    }
    return connectSocket({
      baseURL: BACKEND_URL,
      path,
      origin: NATIVE_ORIGIN,
      getCookie: () => authClient.getCookie(),
      createSocket,
      onStatus: setStatus,
      onOpen: () => callbacks.current.onOpen?.(),
      onMessage: (data) => callbacks.current.onMessage(data),
    });
  }, [path, viewerId, enabled]);
  return enabled && viewerId ? status : "idle";
}
