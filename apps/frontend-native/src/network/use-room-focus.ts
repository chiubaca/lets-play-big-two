import { useEffect } from "react";
import { randomUUID } from "expo-crypto";
import { api } from "./api";

// Sockets are not focus evidence. This authenticated, expiring lease mirrors the
// web focus endpoint, and stops claiming focus as soon as RN backgrounds.
export function useRoomFocus(roomId: string, viewerId: string | undefined, focused: boolean): void {
  useEffect(() => {
    if (!viewerId) return;
    const tabId = randomUUID();
    let sequence = 0;
    const send = (value: boolean) => {
      void api.roomFocus(roomId, { tabId, focused: value, sequence: ++sequence }).catch(() => {});
    };
    send(focused);
    const timer = focused ? setInterval(() => send(true), 8_000) : undefined;
    return () => {
      clearInterval(timer);
      send(false);
    };
  }, [roomId, viewerId, focused]);
}
