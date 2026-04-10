import { AuthButton } from "~/components/AuthButton";
import { authClient } from "~/libs/auth-client";
import { honoClient } from "~/libs/hono-client";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { User, LogOut, Gamepad2, Loader2 } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/")({ component: App });

function App() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <main className="page-wrap px-4 pb-8 pt-14">
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </main>
    );
  }

  if (!session) {
    return <LoginScreen />;
  }

  return <WelcomeScreen session={session} />;
}

function LoginScreen() {
  return (
    <main className="page-wrap px-4 pb-8 pt-14">
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="space-y-2">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--lagoon)] to-[var(--palm)]">
              <Gamepad2 className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Welcome Back</h1>
            <p className="text-muted-foreground">Sign in to play Big Two with your friends</p>
          </div>

          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <AuthButton />
          </div>

          <p className="text-xs text-muted-foreground">
            By signing in, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    </main>
  );
}

function WelcomeScreen({ session }: { session: any }) {
  const navigate = useNavigate();
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [roomCode, setRoomCode] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);

  const createRoomMutation = useMutation({
    mutationFn: async () => {
      const res = await honoClient.api.room.$post();
      if (!res.ok) {
        throw new Error("Failed to create room");
      }
      return res.json();
    },
  });

  const handleSignOut = async () => {
    try {
      await authClient.signOut();
    } catch (error) {
      console.error("Sign out failed:", error);
    }
  };

  const handleCreateGame = async () => {
    try {
      const response = await createRoomMutation.mutateAsync();
      await navigate({ to: "/room/$roomId", params: { roomId: response.roomId } });
    } catch (error) {
      console.error("Failed to create room:", error);
    }
  };

  const handleJoinGame = async () => {
    if (!roomCode.trim()) {
      setJoinError("Please enter a room code");
      return;
    }

    // Navigate directly to the room - the room page will handle joining
    await navigate({ to: "/room/$roomId", params: { roomId: roomCode.trim().toUpperCase() } });
  };

  return (
    <main className="page-wrap px-4 pb-8 pt-14">
      <div className="mx-auto max-w-2xl space-y-8">
        {/* Welcome Card */}
        <div className="rounded-2xl border bg-gradient-to-br from-[var(--hero-a)] to-[var(--hero-b)] p-8">
          <div className="flex items-center gap-6">
            {session.user?.image ? (
              <img
                src={session.user.image}
                alt={`${session.user.name}'s avatar`}
                className="h-20 w-20 rounded-full border-4 border-background shadow-lg"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-background bg-muted shadow-lg">
                <User className="h-10 w-10 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1">
              <h1 className="text-3xl font-bold">
                Welcome back, {session.user?.name?.split(" ")[0]}!
              </h1>
              <p className="text-muted-foreground mt-1">{session.user?.email}</p>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid gap-4 sm:grid-cols-2">
          <button
            onClick={handleCreateGame}
            disabled={createRoomMutation.isPending}
            className="group relative overflow-hidden rounded-xl border bg-card p-6 text-left transition-colors hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--lagoon)]/10">
                {createRoomMutation.isPending ? (
                  <Loader2 className="h-6 w-6 text-[var(--lagoon)] animate-spin" />
                ) : (
                  <Gamepad2 className="h-6 w-6 text-[var(--lagoon)]" />
                )}
              </div>
              <div>
                <h3 className="font-semibold">
                  {createRoomMutation.isPending ? "Creating..." : "Create Game"}
                </h3>
                <p className="text-sm text-muted-foreground">Start a new Big Two match</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setShowJoinModal(true)}
            className="group relative overflow-hidden rounded-xl border bg-card p-6 text-left transition-colors hover:bg-accent"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--palm)]/10">
                <User className="h-6 w-6 text-[var(--palm)]" />
              </div>
              <div>
                <h3 className="font-semibold">Join Game</h3>
                <p className="text-sm text-muted-foreground">Enter a room code</p>
              </div>
            </div>
          </button>
        </div>

        {/* Error Message */}
        {createRoomMutation.isError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
            {createRoomMutation.error?.message || "Failed to create room"}
          </div>
        )}

        {/* Sign Out */}
        <div className="flex justify-center pt-4">
          <button
            onClick={handleSignOut}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </div>

      {/* Join Game Modal */}
      {showJoinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg">
            <h2 className="text-xl font-semibold mb-4">Join Game</h2>
            <p className="text-muted-foreground text-sm mb-4">
              Enter the room code shared by your friend to join the game.
            </p>

            <div className="space-y-4">
              <div>
                <label htmlFor="roomCode" className="block text-sm font-medium mb-1">
                  Room Code
                </label>
                <input
                  id="roomCode"
                  type="text"
                  value={roomCode}
                  onChange={(e) => {
                    setRoomCode(e.target.value.toUpperCase());
                    setJoinError(null);
                  }}
                  placeholder="e.g. ABC12345"
                  className="w-full rounded-lg border bg-background px-3 py-2 text-lg font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-[var(--lagoon)]"
                  maxLength={8}
                />
              </div>

              {joinError && <p className="text-sm text-red-600 dark:text-red-400">{joinError}</p>}

              <div className="flex gap-3">
                <button
                  onClick={() => setShowJoinModal(false)}
                  className="flex-1 rounded-lg border px-4 py-2 font-medium transition-colors hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  onClick={handleJoinGame}
                  disabled={!roomCode.trim()}
                  className="flex-1 rounded-lg bg-[var(--lagoon)] px-4 py-2 font-medium text-white transition-colors hover:bg-[var(--lagoon-deep)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Join
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
