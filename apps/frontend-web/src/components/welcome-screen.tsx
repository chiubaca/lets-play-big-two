import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { LogOut, Users, Bot, Loader2 } from "lucide-react";
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

  const displayName = session.user?.username ?? session.user?.name?.split(" ")[0];

  return (
    <main className="min-h-screen bg-felt">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gold/20 bg-background/80 px-6 py-4 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className="text-gold text-2xl">♠</span>
          <span className="font-display text-xl text-gold tracking-wide">Big Two</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden text-muted-foreground sm:inline text-sm">
            Signed in as <span className="text-gold/90">{displayName}</span>
          </span>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-gold"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="mx-auto max-w-5xl px-4 pb-8 pt-16">
        <div className="mx-auto max-w-3xl space-y-12">
          {/* Hero */}
          <div className="space-y-4 text-center">
            <h1 className="font-display text-5xl text-gold text-shadow-gold sm:text-6xl">
              Big Two
            </h1>
            <p className="mx-auto max-w-xl font-display text-lg italic text-muted-foreground">
              The classic four-player card game — refined, real-time, and ready when you are.
            </p>
          </div>

          {/* Action Cards */}
          <div className="grid gap-6 sm:grid-cols-3">
            {/* Create Room */}
            <div className="group relative overflow-hidden rounded-2xl border border-gold/20 bg-card/50 p-6 backdrop-blur-sm transition-all hover:border-gold/40 hover:bg-card/70">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl text-gold">+</span>
                  <h3 className="font-display text-2xl text-gold">Create</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Start a private room and share the code.
                </p>
                <Button
                  onClick={handleCreateGame}
                  disabled={createRoomMutation.isPending}
                  className="w-full bg-gold-gradient font-display text-primary-foreground transition-all hover:shadow-gold-glow"
                >
                  {createRoomMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Create room"
                  )}
                </Button>
              </div>
            </div>

            {/* Join Room */}
            <div className="group relative overflow-hidden rounded-2xl border border-gold/20 bg-card/50 p-6 backdrop-blur-sm transition-all hover:border-gold/40 hover:bg-card/70">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Users className="h-6 w-6 text-gold" />
                  <h3 className="font-display text-2xl text-gold">Join</h3>
                </div>
                <p className="text-sm text-muted-foreground">Enter a 6-character room code.</p>
                <div className="space-y-3">
                  <Input
                    type="text"
                    value={roomCode}
                    onChange={(e) => {
                      setRoomCode(e.target.value.toUpperCase());
                      setJoinError(null);
                    }}
                    placeholder="A B C D 2 3"
                    className="border-gold/30 bg-input text-center font-mono text-lg tracking-[0.3em] text-gold placeholder:text-muted-foreground/50"
                    maxLength={8}
                  />
                  <Button
                    onClick={handleJoinGame}
                    disabled={!roomCode.trim()}
                    variant="outline"
                    className="w-full border-gold/30 font-display text-foreground hover:border-gold/50 hover:bg-gold/10"
                  >
                    Join room
                  </Button>
                </div>
              </div>
            </div>

            {/* Solo Mode */}
            <div className="group relative overflow-hidden rounded-2xl border border-gold/20 bg-card/50 p-6 backdrop-blur-sm transition-all hover:border-gold/40 hover:bg-card/70">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Bot className="h-6 w-6 text-gold" />
                  <h3 className="font-display text-2xl text-gold">Solo</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Practice instantly against three bots.
                </p>
                <Button
                  onClick={() => navigate({ to: "/offline" })}
                  variant="outline"
                  className="w-full border-gold/30 font-display text-foreground hover:border-gold/50 hover:bg-gold/10"
                >
                  Play solo
                </Button>
              </div>
            </div>
          </div>

          {/* Error Message */}
          {createRoomMutation.isError && (
            <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-center text-destructive">
              {createRoomMutation.error?.message || "Failed to create room"}
            </div>
          )}

          {/* Join Error */}
          {joinError && (
            <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-center text-destructive">
              {joinError}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 border-t border-gold/10 bg-background/80 px-6 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between text-xs text-muted-foreground">
          <span>♠ Big Two — Play responsibly</span>
          <span className="hidden sm:inline">The classic Chinese card game</span>
        </div>
      </footer>

      {/* Join Game Modal */}
      <Dialog open={showJoinModal} onOpenChange={setShowJoinModal}>
        <DialogContent className="border-gold/30 bg-card/95 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl text-gold">Join Game</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Enter the room code shared by your friend to join the game.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-4">
            <div>
              <label htmlFor="roomCode" className="mb-2 block text-sm font-medium text-gold/80">
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
                className="border-gold/30 bg-input font-mono text-lg tracking-wider text-gold placeholder:text-muted-foreground/50"
                maxLength={8}
              />
            </div>

            {joinError && <p className="text-sm text-destructive">{joinError}</p>}

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setShowJoinModal(false)}
                className="border-gold/30 text-foreground hover:bg-gold/10"
              >
                Cancel
              </Button>
              <Button
                onClick={handleJoinGame}
                disabled={!roomCode.trim()}
                className="bg-gold-gradient text-primary-foreground hover:shadow-gold-glow"
              >
                Join
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
