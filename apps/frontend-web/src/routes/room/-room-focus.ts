import { useEffect } from "react";

// A socket is not focus evidence. Each mounted room view has its own expiring tab lease.
export function useRoomFocus(roomId: string, viewerId?: string) {
  useEffect(() => {
    if (!viewerId) return;
    const tabId = crypto.randomUUID();
    let sequence = 0;
    let disposed = false;
    const send = (focused: boolean) => {
      void fetch(
        `${import.meta.env.VITE_BACKEND_URL}/api/turn-notifications/focus/${encodeURIComponent(roomId)}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tabId, focused, sequence: ++sequence }),
          cache: "no-store",
        },
      ).catch(() => {});
    };
    const refresh = () =>
      send(!disposed && document.visibilityState === "visible" && document.hasFocus());
    refresh();
    const timer = setInterval(refresh, 8_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("blur", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      disposed = true;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("blur", refresh);
      document.removeEventListener("visibilitychange", refresh);
      send(false);
    };
  }, [roomId, viewerId]);
}
