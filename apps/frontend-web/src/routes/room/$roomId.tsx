import { authClient } from "@/libs/auth-client";
import { createFileRoute } from "@tanstack/react-router";
import { Users, Copy, Share2, Crown } from "lucide-react";

export const Route = createFileRoute("/room/$roomId")({
  component: RoomPage,
});

function RoomPage() {
  const { roomId } = Route.useParams();
  const { data: session } = authClient.useSession();

  const handleCopyRoomCode = async () => {
    await navigator.clipboard.writeText(roomId);
  };

  return (
    <main className="page-wrap px-4 pb-8 pt-14">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Room Header */}
        <div className="rounded-2xl border bg-gradient-to-br from-indigo-500/10 to-purple-600/10 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold">Game Room</h1>
              <p className="text-muted-foreground">Waiting for players to join...</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-card px-4 py-2 font-mono text-lg font-semibold border">
                {roomId}
              </div>
              <button
                onClick={handleCopyRoomCode}
                className="flex h-10 w-10 items-center justify-center rounded-lg border bg-card transition-colors hover:bg-accent"
                title="Copy room code"
              >
                <Copy className="h-4 w-4" />
              </button>
              <button
                className="flex h-10 w-10 items-center justify-center rounded-lg border bg-card transition-colors hover:bg-accent"
                title="Share room"
              >
                <Share2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Players Section */}
        <div className="rounded-xl border bg-card p-6">
          <div className="mb-4 flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            <h2 className="font-semibold">Players</h2>
            <span className="ml-auto text-sm text-muted-foreground">1 / 4</span>
          </div>

          <div className="space-y-3">
            {/* Current Player */}
            <div className="flex items-center gap-3 rounded-lg border bg-indigo-500/5 p-3">
              {session?.user?.image ? (
                <img
                  src={session.user.image}
                  alt={`${session.user.name}'s avatar`}
                  className="h-10 w-10 rounded-full"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <Users className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1">
                <p className="font-medium">{session?.user?.name || "You"}</p>
                <p className="text-xs text-muted-foreground">Host</p>
              </div>
              <Crown className="h-5 w-5 text-yellow-500" />
            </div>

            {/* Empty Slots */}
            {[2, 3, 4].map((slot) => (
              <div
                key={slot}
                className="flex items-center gap-3 rounded-lg border border-dashed p-3 text-muted-foreground"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <Users className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <p className="text-sm">Waiting for player...</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Game Controls */}
        <div className="flex justify-center gap-4">
          <button
            className="rounded-lg bg-indigo-600 px-6 py-3 font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
            disabled
          >
            Start Game (Need 2-4 players)
          </button>
        </div>
      </div>
    </main>
  );
}
