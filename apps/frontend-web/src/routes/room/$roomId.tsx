import { GameRoomContext, GameRoomProvider } from "~/components/GameRoom/GameRoom.provider";
import { GameBoard } from "~/components/GameRoom/GameBoard";
import { authClient } from "~/libs/auth-client";
import { createFileRoute } from "@tanstack/react-router";
import { useContext, useState } from "react";
import { Copy, Check } from "lucide-react";

export const Route = createFileRoute("/room/$roomId")({
  component: RoomPage,
});

function RoomPage() {
  const { roomId } = Route.useParams();
  const { data: session } = authClient.useSession();

  const user = session?.user;

  if (!user) {
    return (
      <main className="page-wrap px-4 pb-8 pt-14">
        <div className="flex min-h-[50vh] items-center justify-center">
          <p className="text-muted-foreground">Please sign in to join the game</p>
        </div>
      </main>
    );
  }

  return (
    <GameRoomProvider roomId={roomId} user={{ userId: user.id, userName: user.name || "Player" }}>
      <GameRoom />
    </GameRoomProvider>
  );
}

function GameRoom() {
  const { roomId, gameState } = useContext(GameRoomContext);
  const [copied, setCopied] = useState(false);

  const handleCopyRoomCode = () => {
    void navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <main className="page-wrap px-4 pb-8 pt-14">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Room Header */}
        <div className="rounded-2xl border bg-gradient-to-br from-[var(--hero-a)] to-[var(--hero-b)] p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold">Big Two</h1>
              <p className="text-muted-foreground">
                {gameState?.value === "WAITING_FOR_PLAYERS"
                  ? "Waiting for players..."
                  : gameState?.value === "GAME_END"
                    ? "Game Over"
                    : "Game in progress"}
              </p>
            </div>
            <button
              onClick={handleCopyRoomCode}
              className="flex items-center gap-2 rounded-lg bg-card px-4 py-2 font-mono text-lg font-semibold border hover:bg-accent transition-colors"
            >
              {roomId}
              {copied ? (
                <Check className="h-5 w-5 text-green-500" />
              ) : (
                <Copy className="h-5 w-5 text-muted-foreground" />
              )}
            </button>
          </div>
        </div>

        {/* Game Board */}
        <GameBoard />
      </div>
    </main>
  );
}
