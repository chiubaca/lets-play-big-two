import { useEffect } from "react";

import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";

import { AuthPanel } from "../../components/auth-panel";
import { CasinoBackdrop } from "../../components/casino/casino";
import { HomeLogo } from "../../components/home-logo";
import { OnlineGameRoom } from "../../components/game-room";
import { authClient } from "../../libs/auth-client";
import "./room-auth.css";

import type { RoomGameState } from "@big-two/game-state-machine";

export const Route = createFileRoute("/room/$roomId")({
  component: RoomPage,
});

function RoomPage() {
  const { roomId } = Route.useParams();
  const { data: session, isPending } = authClient.useSession();
  useSubscribeToGameState({ roomId, signedIn: Boolean(session?.user) });

  const user = session?.user;

  if (isPending) {
    return <main className="room-auth-loading">Checking your membership…</main>;
  }

  if (!user) {
    return <RoomSignIn roomId={roomId} />;
  }

  return <OnlineGameRoom roomId={roomId} user={{ id: user.id, name: user.name }} />;
}

export function RoomSignIn({ roomId }: { roomId: string }) {
  return (
    <main className="room-auth-page">
      <CasinoBackdrop />
      <div className="room-auth-content">
        <div className="room-auth-art">
          <HomeLogo />
        </div>
        <div className="auth-panel-surface room-auth-card">
          <p className="room-auth-code">Room {roomId}</p>
          <AuthPanel returnToCurrentPage />
        </div>
      </div>
    </main>
  );
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
