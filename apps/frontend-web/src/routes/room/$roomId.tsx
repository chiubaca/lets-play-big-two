import { createFileRoute } from "@tanstack/react-router";

import { AuthPanel } from "../../components/auth-panel";
import { CasinoBackdrop } from "../../components/casino/casino";
import { HomeLogo } from "../../components/home-logo";
import { OnlineGameRoom } from "../../components/game-room";
import { authClient } from "../../libs/auth-client";
import { useSubscribeToGameState } from "./-subscribe-to-game-state";
import "./room-auth.css";

export const Route = createFileRoute("/room/$roomId")({
  component: RoomPage,
});

function RoomPage() {
  const { roomId } = Route.useParams();
  const { data: session, isPending } = authClient.useSession();
  useSubscribeToGameState({ roomId, viewerId: session?.user.id });

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
