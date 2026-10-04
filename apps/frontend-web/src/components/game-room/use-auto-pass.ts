import { useEffect, useRef, useState } from "react";
import { getLegalPlays } from "@big-two/game-ai";
import { detectHandType } from "@big-two/game-core";
import type {
  BigTwoGameMachineSnapshot,
  GameEvent,
  RoomGameState,
} from "@big-two/game-state-machine";

const STORAGE_KEY = "big-two-auto-pass";

export function useAutoPass({
  gameState,
  playerId,
  isMyTurn,
  send,
  onError,
}: {
  gameState?: BigTwoGameMachineSnapshot | RoomGameState;
  playerId: string;
  isMyTurn: boolean;
  send: (event: GameEvent) => Promise<void> | void;
  onError: (message: string) => void;
}) {
  const [enabled, setEnabled] = useState(false);
  const attemptedTurn = useRef<string | undefined>(undefined);

  useEffect(() => {
    try {
      setEnabled(localStorage.getItem(STORAGE_KEY) === "true");
    } catch {
      // Storage may be unavailable in private browsers.
    }
  }, []);

  useEffect(() => {
    if (!isMyTurn || gameState?.value !== "NEXT_PLAYER_TURN") {
      attemptedTurn.current = undefined;
      return;
    }
    if (!enabled) return;

    const hand = gameState.context.players.find((player) => player.id === playerId)?.hand;
    const cardsToBeat = gameState.context.cardPile.at(-1);
    if (!hand?.length || !cardsToBeat?.length) return;
    const roundMode = detectHandType(cardsToBeat);
    if (!roundMode) return;

    const turnKey = JSON.stringify([playerId, hand, gameState.context.cardPile]);
    if (attemptedTurn.current === turnKey) return;
    if (getLegalPlays({ hand, roundMode, cardsToBeat }).length > 0) return;

    // A snapshot or callback can change while the server is accepting this pass.
    attemptedTurn.current = turnKey;
    void (async () => {
      try {
        await send({ type: "PASS_TURN", playerId });
      } catch (error) {
        if (attemptedTurn.current !== turnKey) return;
        onError(error instanceof Error ? error.message : "Auto-pass failed. Please pass manually.");
      }
    })();
  }, [enabled, gameState, isMyTurn, onError, playerId, send]);

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // Keep the setting for this session.
    }
  };

  return { enabled, toggle };
}
