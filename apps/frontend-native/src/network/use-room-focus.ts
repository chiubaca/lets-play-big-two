import { useEffect, useRef } from "react";
import { randomUUID } from "expo-crypto";
import { api } from "./api";

// Sockets are not focus evidence. This authenticated, expiring lease mirrors the
// web focus endpoint, and stops claiming focus as soon as RN backgrounds.
export function useRoomFocus(
  roomId: string,
  viewerId: string | undefined,
  focused: boolean,
  authenticated = true,
): void {
  const current = useRef({ viewerId, authenticated });
  current.current = { viewerId, authenticated };
  useEffect(() => {
    if (!viewerId || !authenticated) return;
    const tabId = randomUUID();
    let sequence = 0;
    const send = (value: boolean) => {
      // Do not release an old account's lease using a new account's cookie, or
      // perform authenticated work during revalidation. That lease can expire.
      if (!current.current.authenticated || current.current.viewerId !== viewerId) return;
      void api.roomFocus(roomId, { tabId, focused: value, sequence: ++sequence }).catch(() => {});
    };
    send(focused);
    const timer = focused ? setInterval(() => send(true), 8_000) : undefined;
    return () => {
      clearInterval(timer);
      send(false);
    };
  }, [roomId, viewerId, focused, authenticated]);
}
