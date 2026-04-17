import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { User, LogOut, Gamepad2, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "~/components/ui/dialog";
import { authClient } from "~/libs/auth-client";
import { honoClient } from "~/libs/hono-client";

interface WelcomeScreenProps {
  session: {
    user: {
      id: string;
      name: string;
      email: string;
      emailVerified: boolean;
      username?: string | null;
      displayUsername?: string | null;
      image?: string | null;
    };
  };
}

export function WelcomeScreen({ session }: WelcomeScreenProps) {
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

    await navigate({ to: "/room/$roomId", params: { roomId: roomCode.trim().toUpperCase() } });
  };

  return (
    <main className="mx-auto max-w-5xl px-4 pb-8 pt-14">
      <div className="mx-auto max-w-2xl space-y-8">
        {/* Welcome Card */}
        <div className="rounded-2xl border bg-gradient-to-br from-primary to-secondary p-8">
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
                Welcome back, {session.user?.username ?? session.user?.name?.split(" ")[0]}!
              </h1>
              <p className="mt-1 text-muted-foreground">{session.user?.email}</p>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid gap-4 sm:grid-cols-2">
          <button
            onClick={handleCreateGame}
            disabled={createRoomMutation.isPending}
            className="group relative overflow-hidden rounded-xl border bg-card p-6 text-left transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                {createRoomMutation.isPending ? (
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                ) : (
                  <Gamepad2 className="h-6 w-6 text-primary" />
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
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-secondary">
                <User className="h-6 w-6 text-secondary-foreground" />
              </div>
              <div>
                <h3 className="font-semibold">Join Game</h3>
                <p className="text-sm text-muted-foreground">Enter a room code</p>
              </div>
            </div>
          </button>

          <button
            onClick={async () => {
              await navigate({ to: "/offline" });
            }}
            className="group relative overflow-hidden rounded-xl border bg-card p-6 text-left transition-colors hover:bg-accent"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-500/10">
                <User className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold">Single device mode</h3>
                <p className="text-sm text-muted-foreground"> Offline multiplayer</p>
              </div>
            </div>
          </button>
        </div>

        {/* Error Message */}
        {createRoomMutation.isError && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
            {createRoomMutation.error?.message || "Failed to create room"}
          </div>
        )}

        {/* Sign Out */}
        <div className="flex justify-center pt-4">
          <Button
            variant="ghost"
            onClick={handleSignOut}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </div>

      {/* Join Game Modal */}
      <Dialog open={showJoinModal} onOpenChange={setShowJoinModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Join Game</DialogTitle>
            <DialogDescription>
              Enter the room code shared by your friend to join the game.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label htmlFor="roomCode" className="mb-1 block text-sm font-medium">
                Room Code
              </label>
              <Input
                id="roomCode"
                type="text"
                value={roomCode}
                onChange={(e) => {
                  setRoomCode(e.target.value.toUpperCase());
                  setJoinError(null);
                }}
                placeholder="e.g. ABC12345"
                className="font-mono text-lg tracking-wider"
                maxLength={8}
              />
            </div>

            {joinError && <p className="text-sm text-destructive">{joinError}</p>}

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowJoinModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleJoinGame} disabled={!roomCode.trim()}>
                Join
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
