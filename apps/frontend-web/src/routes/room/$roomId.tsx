import { useEffect } from "react";

import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";

import { OnlineGameRoom } from "../../components/game-room";
import { authClient } from "../../libs/auth-client";

import type { RoomGameState } from "@big-two/game-state-machine";

export const Route = createFileRoute("/room/$roomId")({
  component: RoomPage,
});

function RoomPage() {
  const { roomId } = Route.useParams();
  const { data: session } = authClient.useSession();
  useSubscribeToGameState({ roomId, signedIn: Boolean(session?.user) });

  const user = session?.user;

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center">Please sign in to join a game</div>
    );
  }

  return <OnlineGameRoom roomId={roomId} user={{ id: user.id, name: user.name }} />;
}

export const useSubscribeToGameState = ({
  roomId,
  signedIn,
}: {
  roomId: string;
  signedIn: boolean;
}) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    queryClient.removeQueries({ queryKey: ["gameState", roomId] });
    if (!signedIn) return;
    const host = import.meta.env.VITE_BACKEND_URL.replace(/^https?/, "wss");
    let websocket: WebSocket;
    let retry: ReturnType<typeof setTimeout>;
    let disposed = false;
    const connect = () => {
      websocket = new WebSocket(`${host}/api/room/ws/${roomId}`);
      websocket.onmessage = (event) => {
        queryClient.setQueryData<RoomGameState>(["gameState", roomId], JSON.parse(event.data));
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
  }, [queryClient, roomId, signedIn]);
};
