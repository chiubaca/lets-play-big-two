import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Bot,
  Loader2,
  LockKeyhole,
  LogIn,
  LogOut,
  Plus,
  Sparkles,
  UsersRound,
  Wifi,
  X,
} from "lucide-react";
import { useState } from "react";
import { AuthPanel } from "~/components/auth-panel";
import {
  CasinoBackdrop,
  CasinoKicker,
  CasinoPanel,
  CasinoTableMark,
  CasinoWordmark,
  DecorativeCardFan,
} from "~/components/casino/casino";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { authClient } from "~/libs/auth-client";
import { honoClient } from "~/libs/hono-client";
import "./home-screen.css";

export interface HomeSession {
  user: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    username?: string | null;
    displayUsername?: string | null;
    image?: string | null;
  };
}

export function HomeScreen({
  session,
  sessionPending,
}: {
  session: HomeSession | null;
  sessionPending: boolean;
}) {
  const navigate = useNavigate();
  const [authOpen, setAuthOpen] = useState(false);
  const [roomCode, setRoomCode] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const createRoom = useMutation({
    mutationFn: async () => {
      const response = await honoClient.api.room.$post();
      if (!response.ok) throw new Error("Couldn’t open a room. Please try again.");
      return response.json();
    },
    onSuccess: (room) => navigate({ to: "/room/$roomId", params: { roomId: room.roomId } }),
  });

  const displayName = session?.user.username ?? session?.user.name?.split(" ")[0];
  const joinRoom = async () => {
    const code = roomCode.trim().toUpperCase();
    if (!code) {
      setJoinError("Enter the room code from your friend.");
      return;
    }
    await navigate({ to: "/room/$roomId", params: { roomId: code } });
  };

  return (
    <main className="home-page">
      <CasinoBackdrop />
      <header className="home-nav">
        <CasinoWordmark />
        {session ? (
          <div className="home-account">
            <span>
              <small>Member</small>
              {displayName}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Sign out"
              onClick={() => void authClient.signOut()}
            >
              <LogOut />
            </Button>
          </div>
        ) : (
          <Button
            variant="lacquer"
            className="home-sign-in"
            disabled={sessionPending}
            onClick={() => setAuthOpen(true)}
          >
            {sessionPending ? <Loader2 className="animate-spin" /> : <LogIn />}
            Sign in
          </Button>
        )}
      </header>

      <div className="home-content">
        <section className="home-hero" aria-labelledby="home-title">
          <div className="home-copy">
            <CasinoKicker>Hong Kong’s favourite shedding game</CasinoKicker>
            <h1 id="home-title">
              Big cards.
              <em>Better company.</em>
            </h1>
            <p className="home-intro">
              Outsmart the table, empty your hand, and make the mighty 2 count. No account needed
              for local play.
            </p>

            <div className="home-mode-grid" aria-label="Choose a way to play">
              <Link
                to="/offline"
                search={{ mode: undefined }}
                className="home-mode-card home-mode-solo"
              >
                <span className="home-mode-number">01</span>
                <span className="home-mode-icon">
                  <Bot aria-hidden="true" />
                </span>
                <span className="home-mode-copy">
                  <small>Instant game</small>
                  <strong>Solo vs bots</strong>
                  <span>Sharpen your hand against three opponents.</span>
                </span>
                <ArrowRight className="home-mode-arrow" aria-hidden="true" />
              </Link>

              <Link
                to="/offline"
                search={{ mode: "pass-and-play" }}
                className="home-mode-card home-mode-pass"
              >
                <span className="home-mode-number">02</span>
                <span className="home-mode-icon">
                  <UsersRound aria-hidden="true" />
                </span>
                <span className="home-mode-copy">
                  <small>One device</small>
                  <strong>Pass &amp; Play</strong>
                  <span>Deal in two to four friends around one screen.</span>
                </span>
                <ArrowRight className="home-mode-arrow" aria-hidden="true" />
              </Link>
            </div>
          </div>

          <div className="home-table-scene" aria-hidden="true">
            <span className="home-table-light" />
            <div className="home-mini-table">
              <CasinoTableMark />
              <DecorativeCardFan />
              <span className="home-chip chip-one">♠</span>
              <span className="home-chip chip-two">2</span>
              <span className="home-table-plaque">PLAY ANYWHERE · STAY SHARP</span>
            </div>
          </div>
        </section>

        <CasinoPanel className="home-online" id="multiplayer" aria-labelledby="online-title">
          <div className="home-online-heading">
            <span className="home-online-icon">
              <Wifi aria-hidden="true" />
            </span>
            <div>
              <CasinoKicker>03 · Online multiplayer</CasinoKicker>
              <h2 id="online-title">A private table, wherever they are.</h2>
              <p>Create a room, share the code, and play together in real time.</p>
            </div>
          </div>

          {session ? (
            <div className="home-online-actions">
              <Button
                variant="gold"
                className="h-12 px-5 text-base"
                disabled={createRoom.isPending}
                onClick={() => createRoom.mutate()}
              >
                {createRoom.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
                Create room
              </Button>
              <div className="home-room-code">
                <label htmlFor="home-room-code">Have a code?</label>
                <div>
                  <Input
                    id="home-room-code"
                    value={roomCode}
                    maxLength={8}
                    placeholder="ABCD23"
                    onChange={(event) => {
                      setRoomCode(event.target.value.toUpperCase());
                      setJoinError(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void joinRoom();
                    }}
                  />
                  <Button variant="lacquer" className="h-12 px-5" onClick={() => void joinRoom()}>
                    Join <ArrowRight />
                  </Button>
                </div>
              </div>
              {(joinError || createRoom.error) && (
                <p className="home-online-error" role="alert">
                  {joinError ?? createRoom.error?.message}
                </p>
              )}
            </div>
          ) : (
            <div className="home-online-signin">
              <div>
                <LockKeyhole aria-hidden="true" />
                <span>
                  <strong>Account optional</strong>Only online rooms need a sign-in.
                </span>
              </div>
              <Button
                variant="gold"
                className="h-12 px-6 text-base"
                disabled={sessionPending}
                onClick={() => setAuthOpen(true)}
              >
                {sessionPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
                Sign in for multiplayer
              </Button>
            </div>
          )}
        </CasinoPanel>
      </div>

      <footer className="home-footer">
        <span>♠ BIG TWO</span>
        <span>Big cards · Bigger friendships</span>
        <span>Play responsibly</span>
      </footer>

      <Dialog open={authOpen} onOpenChange={setAuthOpen}>
        <DialogContent className="home-auth-dialog" showCloseButton={false}>
          <button
            type="button"
            className="home-auth-close"
            aria-label="Close sign in"
            onClick={() => setAuthOpen(false)}
          >
            <X aria-hidden="true" />
          </button>
          <DialogTitle className="sr-only">Sign in for online multiplayer</DialogTitle>
          <DialogDescription className="sr-only">
            Sign in or create an account to create and join online Big Two rooms.
          </DialogDescription>
          <AuthPanel />
        </DialogContent>
      </Dialog>
    </main>
  );
}
