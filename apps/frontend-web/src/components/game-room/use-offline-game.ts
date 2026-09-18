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
import { requestJevBotMove, type JevBotMoveDecision } from "./jev-bot-client";
import type { BotStrategy, GameRoomUser } from "./game-room";

const BOT_THINKING_DELAY_MS = 650;

export const OFFLINE_HUMAN: GameRoomUser = {
  id: "solo-player",
  name: "You",
};

export type OfflinePlayer = GameRoomUser & { isBot?: boolean; botStrategy?: BotStrategy };

export type JevDecisionLogEntry = {
  sequence: number;
  playerId: string;
  playerName: string;
  decision: JevBotMoveDecision;
};

const OFFLINE_PLAYERS: OfflinePlayer[] = [
  OFFLINE_HUMAN,
  { id: "bot-ada", name: "Eve", isBot: true, botStrategy: "basic" },
  { id: "bot-jev", name: "Bob", isBot: true, botStrategy: "basic" },
  { id: "bot-alan", name: "Alan", isBot: true, botStrategy: "basic" },
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
  const decisionSequenceRef = useRef(0);
  const [gameState, setGameState] = useState<BigTwoGameMachineSnapshot>();
  const [jevDecisionLog, setJevDecisionLog] = useState<JevDecisionLogEntry[]>([]);
  const [jevFallbackPlayerIds, setJevFallbackPlayerIds] = useState<Set<string>>(new Set());
  const [thinkingPlayerId, setThinkingPlayerId] = useState<string>();
  const playersRef = useRef<OfflinePlayer[]>([]);
  const [players, setPlayers] = useState<OfflinePlayer[]>([]);
  const [readyPlayerId, setReadyPlayerId] = useState<string>();

  const start = useCallback((players?: OfflinePlayer[]) => {
    if (actorRef.current) return;
    const gamePlayers = (players ?? OFFLINE_PLAYERS).map((player) => ({ ...player }));
    decisionSequenceRef.current = 0;
    setJevDecisionLog([]);
    setJevFallbackPlayerIds(new Set());
    playersRef.current = gamePlayers;
    setPlayers(gamePlayers);

    const actor = createActor(bigTwoGameMachine);
    actorRef.current = actor;
    let previousPlayerId: string | undefined;
    subscriptionRef.current = actor.subscribe((snapshot) => {
      const currentPlayerId = snapshot.context.players[snapshot.context.currentPlayerIndex]?.id;
      if (currentPlayerId !== previousPlayerId || !isGameTurnState(snapshot.value)) {
        setReadyPlayerId(undefined);
      }
      previousPlayerId = currentPlayerId;
      setGameState(snapshot);
    });
    actor.start();

    for (const player of playersRef.current) {
      actor.send({
        type: "JOIN_GAME",
        playerId: player.id,
        playerName: player.name,
      });
    }
    actor.send({ type: "START_GAME" });
  }, []);

  const setBotStrategy = useCallback((playerId: string, botStrategy: BotStrategy) => {
    let changed = false;
    const updatedPlayers = playersRef.current.map((player) => {
      if (!player.isBot || player.id !== playerId || player.botStrategy === botStrategy) {
        return player;
      }
      changed = true;
      return { ...player, botStrategy };
    });

    if (!changed) return;
    playersRef.current = updatedPlayers;
    setPlayers(updatedPlayers);
    if (botStrategy === "basic") {
      setJevFallbackPlayerIds((current) => {
        if (!current.has(playerId)) return current;
        const updated = new Set(current);
        updated.delete(playerId);
        return updated;
      });
    }
  }, []);

  const send = useCallback((event: GameEvent) => {
    const actor = actorRef.current;
    if (!actor) return;

    actor.send(event);

    if (event.type === "RESET_GAME") {
      decisionSequenceRef.current = 0;
      setJevDecisionLog([]);
      setJevFallbackPlayerIds(new Set());
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
    if (
      !currentPlayer ||
      !playersRef.current.find((player) => player.id === currentPlayer.id)?.isBot
    ) {
      setThinkingPlayerId(undefined);
      return;
    }

    setThinkingPlayerId(currentPlayer.id);
    botTimerRef.current = setTimeout(() => {
      void (async () => {
        const actor = actorRef.current;
        const decisionState = actor?.getSnapshot();
        if (!actor || !decisionState || !isGameTurnState(decisionState.value)) return;

        const decisionPlayer =
          decisionState.context.players[decisionState.context.currentPlayerIndex];
        if (!decisionPlayer || decisionPlayer.id !== currentPlayer.id) return;

        const botStrategy =
          playersRef.current.find((player) => player.id === decisionPlayer.id)?.botStrategy ??
          "basic";
        let cards: Card[] | null;
        let jevDecision: JevBotMoveDecision | undefined;
        let clientFallback = false;
        if (botStrategy === "jev") {
          try {
            jevDecision = await requestJevBotMove(decisionState, decisionPlayer.id);
            cards = jevDecision.cards;
          } catch {
            clientFallback = true;
            cards = chooseMove(decisionState, decisionPlayer.hand);
          }
        } else {
          cards = chooseMove(decisionState, decisionPlayer.hand);
        }

        if (actorRef.current !== actor || actor.getSnapshot() !== decisionState) return;

        if (clientFallback || jevDecision?.source === "fallback") {
          setJevFallbackPlayerIds((current) => {
            if (current.has(decisionPlayer.id)) return current;
            return new Set(current).add(decisionPlayer.id);
          });
        } else if (jevDecision?.source === "jev") {
          setJevFallbackPlayerIds((current) => {
            if (!current.has(decisionPlayer.id)) return current;
            const updated = new Set(current);
            updated.delete(decisionPlayer.id);
            return updated;
          });
        }

        if (jevDecision) {
          decisionSequenceRef.current += 1;
          const entry: JevDecisionLogEntry = {
            sequence: decisionSequenceRef.current,
            playerId: decisionPlayer.id,
            playerName: decisionPlayer.name,
            decision: jevDecision,
          };
          setJevDecisionLog((previous) => [entry, ...previous].slice(0, 12));
        }

        const playEvent = cards?.length
          ? createPlayEvent(decisionState, decisionPlayer.id, cards)
          : undefined;
        actor.send(
          playEvent ?? ({ type: "PASS_TURN", playerId: decisionPlayer.id } satisfies GameEvent),
        );
        setThinkingPlayerId(undefined);
      })();
    }, BOT_THINKING_DELAY_MS);

    return () => {
      if (botTimerRef.current) clearTimeout(botTimerRef.current);
    };
  }, [gameState]);

  return {
    botPlayers: players.filter((player) => player.isBot),
    gameState,
    jevDecisionLog,
    jevFallbackPlayerIds,
    readyPlayerId,
    ready: () => {
      const snapshot = actorRef.current?.getSnapshot();
      if (snapshot && isGameTurnState(snapshot.value)) {
        const player = playersRef.current.find(
          (entry) => entry.id === snapshot.context.players[snapshot.context.currentPlayerIndex]?.id,
        );
        if (player && !player.isBot) setReadyPlayerId(player.id);
      }
    },
    isBotTurn:
      playersRef.current.find(
        (player) =>
          player.id === gameState?.context.players[gameState.context.currentPlayerIndex]?.id,
      )?.isBot ?? false,
    requestHint,
    send,
    setBotStrategy,
    start,
    thinkingPlayerId,
  };
}
