import { useEffect } from "react";

import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";

import { GameRoom } from "../../components/game-room";
import { authClient } from "../../libs/auth-client";

import type { BigTwoGameMachineSnapshot } from "@big-two/game-state-machine";

export const Route = createFileRoute("/room/$roomId")({
  component: RoomPage,
});

function RoomPage() {
  const { roomId } = Route.useParams();
  useSubscribeToGameState({ roomId });
  const { data: session } = authClient.useSession();

  const user = session?.user;

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center">Please sign in to join a game</div>
    );
  }

  return <GameRoom roomId={roomId} user={user} />;
}

export const useSubscribeToGameState = ({ roomId }: { roomId: string }) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const host = import.meta.env.VITE_BACKEND_URL.replace(/^https?/, "wss");
    const WEBSOCKET_ENDPOINT = `${host}/api/room/ws/${roomId}`;

    const websocket = new WebSocket(WEBSOCKET_ENDPOINT);

    websocket.onopen = (e) => {
      (console.log("connected!"), e);
    };

    websocket.onmessage = (event) => {
      console.log("🔍 ~ onmesage!!", event);
      const gameState = JSON.parse(event.data);

      queryClient.setQueryData<BigTwoGameMachineSnapshot>(["gameState", roomId], gameState);
    };

    websocket.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    return () => {
      websocket.close();
    };
  }, [roomId]);

  // return { gameState };
};
