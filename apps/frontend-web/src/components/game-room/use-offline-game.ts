import { useCallback, useEffect, useRef, useState } from "react";
import { chooseBotMove } from "@big-two/game-ai";
import {
  bigTwoGameMachine,
  type BigTwoGameMachineSnapshot,
  type Card,
  type GameEvent,
} from "@big-two/game-state-machine";
import { createActor, type ActorRefFrom, type Subscription } from "xstate";

import {
  createPlayEvent,
  getCardsToBeat,
  getRequiredCard,
  isGameTurnState,
} from "./game-room-session";
import type { GameRoomUser } from "./game-room";

const BOT_THINKING_DELAY_MS = 650;

export const OFFLINE_HUMAN: GameRoomUser = {
  id: "solo-player",
  name: "You",
};

const OFFLINE_PLAYERS: GameRoomUser[] = [
  OFFLINE_HUMAN,
  { id: "bot-ada", name: "Ada" },
  { id: "bot-grace", name: "Grace" },
  { id: "bot-alan", name: "Alan" },
];

type GameActor = ActorRefFrom<typeof bigTwoGameMachine>;

function chooseMove(gameState: BigTwoGameMachineSnapshot, hand: Card[]) {
  return chooseBotMove({
    hand,
    roundMode: gameState.context.roundMode,
    cardsToBeat: getCardsToBeat(gameState),
    requiredCard: getRequiredCard(gameState),
  });
}

export function useOfflineGame() {
  const actorRef = useRef<GameActor | null>(null);
  const subscriptionRef = useRef<Subscription | null>(null);
  const botTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [gameState, setGameState] = useState<BigTwoGameMachineSnapshot>();
  const [thinkingPlayerId, setThinkingPlayerId] = useState<string>();

  const start = useCallback(() => {
    if (actorRef.current) return;

    const actor = createActor(bigTwoGameMachine);
    actorRef.current = actor;
    subscriptionRef.current = actor.subscribe((snapshot) => setGameState(snapshot));
    actor.start();

    for (const player of OFFLINE_PLAYERS) {
      actor.send({
        type: "JOIN_GAME",
        playerId: player.id,
        playerName: player.name,
      });
    }
    actor.send({ type: "START_GAME" });
  }, []);

  const send = useCallback((event: GameEvent) => {
    const actor = actorRef.current;
    if (!actor) return;

    actor.send(event);

    if (event.type === "RESET_GAME") {
      actor.send({ type: "START_GAME" });
    }
  }, []);

  const requestHint = useCallback(() => {
    const snapshot = actorRef.current?.getSnapshot();
    if (!snapshot || !isGameTurnState(snapshot.value)) return null;

    const human = snapshot.context.players.find((player) => player.id === OFFLINE_HUMAN.id);
    if (!human) return null;

    return chooseMove(snapshot, human.hand) ?? null;
  }, []);

  useEffect(() => {
    return () => {
      if (botTimerRef.current) clearTimeout(botTimerRef.current);
      subscriptionRef.current?.unsubscribe();
      actorRef.current?.stop();
      actorRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (botTimerRef.current) {
      clearTimeout(botTimerRef.current);
      botTimerRef.current = null;
    }

    if (!gameState || !isGameTurnState(gameState.value)) {
      setThinkingPlayerId(undefined);
      return;
    }

    const currentPlayer = gameState.context.players[gameState.context.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.id === OFFLINE_HUMAN.id) {
      setThinkingPlayerId(undefined);
      return;
    }

    setThinkingPlayerId(currentPlayer.id);
    botTimerRef.current = setTimeout(() => {
      const actor = actorRef.current;
      const latestState = actor?.getSnapshot();
      if (!actor || !latestState || !isGameTurnState(latestState.value)) return;

      const latestPlayer = latestState.context.players[latestState.context.currentPlayerIndex];
      if (!latestPlayer || latestPlayer.id !== currentPlayer.id) return;

      const cards = chooseMove(latestState, latestPlayer.hand);
      const playEvent = cards?.length
        ? createPlayEvent(latestState, latestPlayer.id, cards)
        : undefined;

      actor.send(
        playEvent ?? ({ type: "PASS_TURN", playerId: latestPlayer.id } satisfies GameEvent),
      );
      setThinkingPlayerId(undefined);
    }, BOT_THINKING_DELAY_MS);

    return () => {
      if (botTimerRef.current) clearTimeout(botTimerRef.current);
    };
  }, [gameState]);

  return {
    gameState,
    requestHint,
    send,
    start,
    thinkingPlayerId,
  };
}
