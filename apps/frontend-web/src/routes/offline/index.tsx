import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Users, Bot, Sparkles } from "lucide-react";
import { Button } from "~/components/ui/button";
import { GameRoom } from "~/components/game-room";
import { OFFLINE_HUMAN, useOfflineGame } from "~/components/game-room/use-offline-game";
import { useState } from "react";
import { PassAndPlay } from "~/components/game-room/pass-and-play.tsx";

export const Route = createFileRoute("/offline/")({
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = useNavigate();
  const [passAndPlay, setPassAndPlay] = useState(false);
  const { botPlayers, gameState, requestHint, send, setBotStrategy, start, thinkingPlayerId } =
    useOfflineGame();

  if (passAndPlay) return <PassAndPlay onBack={() => setPassAndPlay(false)} />;

  if (gameState) {
    return (
      <GameRoom
        gameState={gameState}
        botSettings={{ players: botPlayers, onStrategyChange: setBotStrategy }}
        requestHint={requestHint}
        send={send}
        tableLabel="Solo table"
        thinkingPlayerId={thinkingPlayerId}
        user={OFFLINE_HUMAN}
      />
    );
  }

  return (
    <main className="flex min-h-svh flex-col bg-felt">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gold/20 bg-background/80 px-6 py-4 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className="text-gold text-2xl">♠</span>
          <span className="font-display text-xl text-gold tracking-wide">Big Two</span>
        </div>
        <Button
          variant="ghost"
          className="text-foreground/80 transition-all hover:bg-gold/10 hover:text-gold"
          onClick={() => navigate({ to: "/" })}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
      </header>

      {/* Main Content */}
      <div className="mx-auto flex w-full max-w-2xl flex-1 items-center px-4 py-8 sm:py-12">
        <div className="space-y-8 text-center">
          {/* Title */}
          <div className="space-y-3">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gold-gradient shadow-gold-glow">
              <Bot className="h-8 w-8 text-primary-foreground" />
            </div>
            <h1 className="font-display text-4xl text-gold text-shadow-gold">Offline Play</h1>
            <p className="text-lg text-muted-foreground">
              Practice solo or share a table with friends on one device
            </p>
          </div>

          {/* Info Cards */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-gold/20 bg-card/50 p-6 backdrop-blur-sm">
              <Users className="mx-auto mb-3 h-8 w-8 text-gold" />
              <h3 className="mb-2 font-display text-xl text-gold">4 Players</h3>
              <p className="text-sm text-muted-foreground">
                You versus three bots. Choose Basic or TypeSafe-powered Jev AI for each opponent
              </p>
            </div>

            <div className="rounded-2xl border border-gold/20 bg-card/50 p-6 backdrop-blur-sm">
              <Sparkles className="mx-auto mb-3 h-8 w-8 text-gold" />
              <h3 className="mb-2 font-display text-xl text-gold">No Account</h3>
              <p className="text-sm text-muted-foreground">
                Jump right in without signing in or creating an account
              </p>
            </div>
          </div>

          {/* Start Button */}
          <div className="pt-4">
            <Button
              size="lg"
              className="bg-gold-gradient px-12 font-display text-lg text-primary-foreground transition-all hover:shadow-gold-glow"
              onClick={() => start()}
            >
              Start Solo Game
            </Button>
            <div className="mt-6 rounded-2xl border border-gold/30 bg-card/50 p-6">
              <h2 className="font-display text-2xl text-gold">Pass &amp; Play</h2>
              <p className="mt-2 mb-4 text-sm text-muted-foreground">
                Two to four friends. One device. Private hands, with optional AI opponents.
              </p>
              <Button
                variant="outline"
                className="border-gold/30"
                onClick={() => setPassAndPlay(true)}
              >
                Set up Pass &amp; Play
              </Button>
            </div>
          </div>

          {/* Game details */}
          <div className="rounded-xl border border-gold/20 bg-card/30 p-6 backdrop-blur-sm">
            <p className="text-muted-foreground">
              <span className="font-medium text-gold">Play at your pace.</span> Use Hint whenever
              you want a suggested move. Each opponent pauses briefly so you can follow the table.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gold/10 bg-background/80 px-6 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-center text-xs text-muted-foreground/60">
          <span>♠ Big Two — Perfect your strategy against AI</span>
        </div>
      </footer>
    </main>
  );
}
