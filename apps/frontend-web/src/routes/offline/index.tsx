import { lazy, Suspense, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Bot, Sparkles, Users } from "lucide-react";
import { Button } from "~/components/ui/button";
import { CasinoLobby, CasinoPanel } from "~/components/casino/casino";
import { GameRoom } from "~/components/game-room";
import { OFFLINE_HUMAN, useOfflineGame } from "~/components/game-room/use-offline-game";
import { PassAndPlay } from "~/components/game-room/pass-and-play.tsx";

const LazyJevDevtools = import.meta.env.DEV
  ? lazy(() =>
      import("~/components/game-room/jev-devtools").then(({ JevDevtools }) => ({
        default: JevDevtools,
      })),
    )
  : null;

export const Route = createFileRoute("/offline/")({
  validateSearch: (search: Record<string, unknown>) => ({
    mode: search.mode === "pass-and-play" ? ("pass-and-play" as const) : undefined,
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = useNavigate();
  const { mode } = Route.useSearch();
  const [passAndPlay, setPassAndPlay] = useState(mode === "pass-and-play");
  const {
    botPlayers,
    gameState,
    jevDecisionLog,
    jevFallbackPlayerIds,
    requestHint,
    send,
    setBotStrategy,
    start,
    thinkingPlayerId,
  } = useOfflineGame();

  if (passAndPlay) {
    return (
      <PassAndPlay
        onBack={() => {
          setPassAndPlay(false);
          void navigate({ to: "/offline", search: { mode: undefined }, replace: true });
        }}
      />
    );
  }

  if (gameState) {
    return (
      <>
        <GameRoom
          gameState={gameState}
          botSettings={{ players: botPlayers, onStrategyChange: setBotStrategy }}
          jevFallbackPlayerIds={jevFallbackPlayerIds}
          requestHint={requestHint}
          send={send}
          tableLabel="Solo table"
          thinkingPlayerId={thinkingPlayerId}
          user={OFFLINE_HUMAN}
        />
        {LazyJevDevtools && (
          <Suspense fallback={null}>
            <LazyJevDevtools decisions={jevDecisionLog} />
          </Suspense>
        )}
      </>
    );
  }

  return (
    <CasinoLobby
      backLabel="Back home"
      description="Practice with three opponents, or gather your friends around one screen. No sign-in, no waiting."
      footer="♠ Big Two · Local tables never need an account"
      icon={<Bot />}
      kicker="Local play · choose your table"
      onBack={() => void navigate({ to: "/" })}
      title="Deal me in."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <CasinoPanel className="flex min-h-64 flex-col p-6 text-left">
          <span className="font-mono text-[9px] tracking-[0.18em] text-[var(--casino-cream-muted)]">
            SOLO PRACTICE
          </span>
          <Bot className="mt-5 h-8 w-8 text-[var(--casino-gold)]" aria-hidden="true" />
          <h2 className="mt-5 font-display text-3xl text-[var(--casino-gold-bright)]">
            You vs the house
          </h2>
          <p className="mt-2 mb-6 flex-1 text-sm leading-relaxed text-[#b9b99f]">
            Face three bots, ask for a hint, and tune each opponent from Basic to Jev.
          </p>
          <Button variant="gold" className="h-12 w-full text-base" onClick={() => start()}>
            Start solo game
          </Button>
        </CasinoPanel>

        <CasinoPanel className="flex min-h-64 flex-col p-6 text-left">
          <span className="font-mono text-[9px] tracking-[0.18em] text-[var(--casino-cream-muted)]">
            SHARED DEVICE
          </span>
          <Users className="mt-5 h-8 w-8 text-[var(--casino-gold)]" aria-hidden="true" />
          <h2 className="mt-5 font-display text-3xl text-[var(--casino-gold-bright)]">
            Pass &amp; Play
          </h2>
          <p className="mt-2 mb-6 flex-1 text-sm leading-relaxed text-[#b9b99f]">
            Two to four friends, private handoffs, and optional AI to fill empty seats.
          </p>
          <Button
            variant="lacquer"
            className="h-12 w-full text-base"
            onClick={() => {
              setPassAndPlay(true);
              void navigate({
                to: "/offline",
                search: { mode: "pass-and-play" },
                replace: true,
              });
            }}
          >
            Set up Pass &amp; Play
          </Button>
        </CasinoPanel>
      </div>

      <div className="mt-5 flex items-center justify-center gap-3 text-center text-xs text-[#a8a68e]">
        <Sparkles className="h-4 w-4 text-[var(--casino-gold)]" aria-hidden="true" />
        <p>Local tables stay on this device. Play at your pace and leave whenever you like.</p>
      </div>
    </CasinoLobby>
  );
}
