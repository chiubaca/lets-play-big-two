import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Bot,
  Loader2,
  LogIn,
  LogOut,
  Plus,
  Trash2,
  UserRound,
  UsersRound,
  Wifi,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AuthPanel, type AuthSuccessUser } from "~/components/auth-panel";
import { CasinoBackdrop, CasinoPanel } from "~/components/casino/casino";
import { HomeLogo } from "~/components/home-logo";
import { MembershipCard } from "~/components/membership-card";
import { useScrollOverlap } from "~/components/use-scroll-overlap";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { signOutAndDetachTurnDevice } from "~/libs/turn-sign-out";
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
    emoji?: string | null;
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
  const pageRef = useRef<HTMLElement>(null);
  const logoStageRef = useRef<HTMLDivElement>(null);
  const modeGridRef = useRef<HTMLDivElement>(null);

  useScrollOverlap(pageRef, logoStageRef, modeGridRef);

  const createRoom = useMutation({
    mutationFn: async () => {
      const response = await honoClient.api.room.$post();
      if (!response.ok) throw new Error("Couldn’t open a room. Please try again.");
      return response.json();
    },
    onSuccess: (room) => navigate({ to: "/room/$roomId", params: { roomId: room.roomId } }),
  });

  const rooms = useQuery({
    queryKey: ["myRooms", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const response = await honoClient.api.rooms.$get();
      if (!response.ok) throw new Error("Couldn’t load your rooms.");
      return (await response.json()).rooms;
    },
  });

  const displayName =
    session?.user.displayUsername ?? session?.user.username ?? session?.user.name?.split(" ")[0];

  const welcomedUserId = useRef<string | null>(null);
  const seenLoggedOut = useRef(false);

  const showWelcome = (userId: string | null, name: string | null | undefined) => {
    if (userId) {
      if (welcomedUserId.current === userId) return;
      welcomedUserId.current = userId;
    }
    toast.success(`Welcome back, ${name ?? "friend"}!`);
  };

  const handleAuthSuccess = (user: AuthSuccessUser) => {
    setAuthOpen(false);
    showWelcome(user.id ?? session?.user.id ?? null, user.displayName ?? displayName);
  };

  useEffect(() => {
    if (!sessionPending && !session) {
      seenLoggedOut.current = true;
      welcomedUserId.current = null;
    }
  }, [session, sessionPending]);

  useEffect(() => {
    if (sessionPending || !session) return;
    let pendingSocialWelcome = false;
    try {
      pendingSocialWelcome = sessionStorage.getItem("big-two-pending-welcome") === "1";
      if (pendingSocialWelcome) sessionStorage.removeItem("big-two-pending-welcome");
    } catch {
      // Storage may be unavailable; fall through to the modal/session transition handling.
    }
    if (welcomedUserId.current === session.user.id) {
      if (authOpen) setAuthOpen(false);
      return;
    }
    if (authOpen || pendingSocialWelcome || seenLoggedOut.current) {
      seenLoggedOut.current = false;
      setAuthOpen(false);
      showWelcome(session.user.id, displayName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, sessionPending, authOpen]);
  const joinRoom = async () => {
    const code = roomCode.trim().toUpperCase();
    if (!code) {
      setJoinError("Enter the room code from your friend.");
      return;
    }
    await navigate({ to: "/room/$roomId", params: { roomId: code } });
  };

  return (
    <main className="home-page" ref={pageRef}>
      <CasinoBackdrop />
      <header className="home-nav">
        {session ? (
          <div className="home-account">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="home-account-trigger"
                  aria-label={`Open account menu for ${displayName}`}
                >
                  <MembershipCard
                    compact
                    name={displayName ?? "Member"}
                    emoji={session.user.emoji ?? "♠️"}
                  />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="home-account-menu">
                <DropdownMenuItem asChild>
                  <Link to="/profile">
                    <UserRound aria-hidden="true" />
                    Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/account">
                    <Trash2 aria-hidden="true" />
                    Account deletion
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void signOutAndDetachTurnDevice()}>
                  <LogOut aria-hidden="true" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
        <section className="home-hero">
          <div className="home-copy">
            <div className="home-logo-stage" ref={logoStageRef}>
              <HomeLogo />
            </div>
            <div className="home-mode-grid" ref={modeGridRef} aria-label="Choose a way to play">
              <Link
                to="/offline"
                search={{ mode: undefined }}
                className="home-mode-card home-mode-solo"
              >
                <span className="home-mode-icon">
                  <Bot aria-hidden="true" />
                </span>
                <span className="home-mode-copy">
                  <strong>Solo play</strong>
                  <span>Play offline against three opponents</span>
                </span>
                <ArrowRight className="home-mode-arrow" aria-hidden="true" />
              </Link>

              <Link
                to="/offline"
                search={{ mode: "pass-and-play" }}
                className="home-mode-card home-mode-pass"
              >
                <span className="home-mode-icon">
                  <UsersRound aria-hidden="true" />
                </span>
                <span className="home-mode-copy">
                  <strong>Pass &amp; Play</strong>
                  <span>Play together on one device</span>
                </span>
                <ArrowRight className="home-mode-arrow" aria-hidden="true" />
              </Link>
              <CasinoPanel className="home-online" id="multiplayer" aria-labelledby="online-title">
                <div className="home-online-heading">
                  <span className="home-online-icon">
                    <Wifi aria-hidden="true" />
                  </span>
                  <div>
                    <h2 id="online-title">Play with the crew</h2>
                    <p>Create a room and play together in real time.</p>
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
                          placeholder="ABCDE"
                          onChange={(event) => {
                            setRoomCode(event.target.value.toUpperCase());
                            setJoinError(null);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") void joinRoom();
                          }}
                        />
                        <Button
                          variant="lacquer"
                          className="h-12 px-5"
                          onClick={() => void joinRoom()}
                        >
                          Join <ArrowRight />
                        </Button>
                      </div>
                    </div>
                    {(joinError || createRoom.error) && (
                      <p className="home-online-error" role="alert">
                        {joinError ?? createRoom.error?.message}
                      </p>
                    )}
                    <section className="home-my-rooms" aria-labelledby="home-my-rooms-title">
                      <div className="home-my-rooms-heading">
                        <h3 id="home-my-rooms-title">Your tables</h3>
                        {rooms.data && <span>{rooms.data.length}</span>}
                      </div>
                      {rooms.isPending ? (
                        <p className="home-my-rooms-note">Loading your tables…</p>
                      ) : rooms.isError ? (
                        <p className="home-online-error" role="alert">
                          {rooms.error.message}{" "}
                          <button type="button" onClick={() => void rooms.refetch()}>
                            Try again
                          </button>
                        </p>
                      ) : rooms.data.length === 0 ? (
                        <p className="home-my-rooms-note">
                          No tables yet. Create one or join with a code.
                        </p>
                      ) : (
                        <ul className="home-my-rooms-list">
                          {rooms.data.map((room) => (
                            <li key={room.roomId}>
                              <Link
                                to="/room/$roomId"
                                params={{ roomId: room.roomId }}
                                className="home-my-room"
                              >
                                <span className="home-my-room-code">{room.roomId}</span>
                                <span className="home-my-room-detail">
                                  {room.status === "waiting"
                                    ? "Waiting for players"
                                    : room.status === "finished"
                                      ? "Game finished"
                                      : "Game in progress"}
                                  <span aria-hidden="true"> · </span>
                                  {room.playerCount} / 4 players
                                </span>
                                <ArrowRight aria-hidden="true" />
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  </div>
                ) : (
                  <div className="home-online-signin">
                    <Button
                      variant="gold"
                      className="h-12 px-6 text-base"
                      disabled={sessionPending}
                      onClick={() => setAuthOpen(true)}
                    >
                      Sign in for multiplayer
                    </Button>
                  </div>
                )}
              </CasinoPanel>
            </div>
          </div>
        </section>
      </div>

      <footer className="home-legal">
        <span>© {new Date().getFullYear()} Big Two Crew</span>
        <Link to="/privacy">Privacy</Link>
        <Link to="/account">Account &amp; data deletion</Link>
      </footer>

      <Dialog open={authOpen} onOpenChange={setAuthOpen}>
        <DialogContent className="home-auth-dialog auth-panel-surface" showCloseButton={false}>
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
          <AuthPanel onSuccess={handleAuthSuccess} />
        </DialogContent>
      </Dialog>
    </main>
  );
}
