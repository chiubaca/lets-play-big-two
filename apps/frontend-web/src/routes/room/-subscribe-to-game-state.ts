import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RoomGameState } from "@big-two/game-state-machine";

export const useSubscribeToGameState = ({
  roomId,
  viewerId,
}: {
  roomId: string;
  viewerId?: string;
}) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!viewerId) {
      queryClient.removeQueries({ queryKey: ["gameState", roomId] });
      return;
    }
    const queryKey = ["gameState", roomId, viewerId];
    const host = import.meta.env.VITE_BACKEND_URL.replace(/^https?/, "wss");
    let websocket: WebSocket;
    let retry: ReturnType<typeof setTimeout>;
    let disposed = false;
    const connect = () => {
      websocket = new WebSocket(`${host}/api/room/ws/${roomId}`);
      websocket.onmessage = (event) => {
        void queryClient.cancelQueries({ queryKey });
        if (disposed) return;
        queryClient.setQueryData<RoomGameState>(queryKey, JSON.parse(event.data));
      };
      websocket.onclose = () => {
        if (!disposed) retry = setTimeout(connect, 2000);
      };
    };
    connect();

    return () => {
      disposed = true;
      clearTimeout(retry);
      websocket.close();
    };
  }, [queryClient, roomId, viewerId]);
};
