import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { GameRoom } from "~/components/game-room";
import { OFFLINE_HUMAN, useOfflineGame } from "~/components/game-room/use-offline-game";
import { PassAndPlay } from "~/components/game-room/pass-and-play.tsx";
import { useJevDevtools } from "~/components/game-room/jev-devtools-context";

export const Route = createFileRoute("/offline/")({
  validateSearch: (search: Record<string, unknown>) => ({
    mode: search.mode === "pass-and-play" ? ("pass-and-play" as const) : undefined,
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = useNavigate();
  const { mode } = Route.useSearch();
  if (mode === "pass-and-play") {
    return <PassAndPlay onBack={() => void navigate({ to: "/" })} />;
  }

  return <SoloGame />;
}

function SoloGame() {
  const { setDecisions } = useJevDevtools();
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
        botSettings={{ players: botPlayers, onStrategyChange: setBotStrategy }}
        jevFallbackPlayerIds={jevFallbackPlayerIds}
        requestHint={requestHint}
        send={send}
        tableLabel="Solo table"
        thinkingPlayerId={thinkingPlayerId}
        user={OFFLINE_HUMAN}
      />
    );
  }

  return null;
}
