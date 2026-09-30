import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { GameRoom } from "~/components/game-room";
import { OFFLINE_HUMAN, useOfflineGame } from "~/components/game-room/use-offline-game";
import { PassAndPlay } from "~/components/game-room/pass-and-play.tsx";
import { useJevDevtools } from "~/components/game-room/jev-devtools-context";
import { authClient } from "~/libs/auth-client";

export const Route = createFileRoute("/offline/")({
  validateSearch: (search: Record<string, unknown>) => ({
    mode: search.mode === "pass-and-play" ? ("pass-and-play" as const) : undefined,
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = useNavigate();
  const { mode } = Route.useSearch();
  const { data: session } = authClient.useSession();
  const emoji = session?.user.emoji ?? "♠️";
  if (mode === "pass-and-play") {
    return <PassAndPlay profileEmoji={emoji} onBack={() => void navigate({ to: "/" })} />;
  }

  return <SoloGame emoji={emoji} />;
}

function SoloGame({ emoji }: { emoji: string }) {
  const { setDecisions } = useJevDevtools();
  const {
    botPlayers,
    gameState,
    jevDecisionLog,
    jevFallbackPlayerIds,
    requestHint,
    send,
    start,
    thinkingPlayerId,
  } = useOfflineGame();

  useEffect(() => {
    start();
  }, [start]);

  useEffect(() => {
    setDecisions(jevDecisionLog);
    return () => setDecisions([]);
  }, [jevDecisionLog, setDecisions]);

  if (gameState) {
    return (
      <GameRoom
        gameState={gameState}
        botSettings={{ players: botPlayers }}
        jevFallbackPlayerIds={jevFallbackPlayerIds}
        requestHint={requestHint}
        send={send}
        tableLabel="Solo table"
        thinkingPlayerId={thinkingPlayerId}
        user={{ ...OFFLINE_HUMAN, emoji }}
      />
    );
  }

  return null;
}
