import { chooseBotMove } from "@big-two/game-ai";
import { getCardRank, SUITS, type Card } from "@big-two/game-core";
import {
  bigTwoGameMachine,
  type BigTwoGameMachineSnapshot,
  type GameEvent,
  type Player,
} from "@big-two/game-state-machine";
import { ensureGameRuntimeCompatibility } from "./native-runtime";

export type OfflineMode = "solo" | "pass-and-play";
export type HandOrder = "rank" | "suit";
export interface OfflineSeat {
  name: string;
  isBot: boolean;
}
export interface OfflineGameConfig {
  players: OfflineSeat[];
}
export const LOCAL_HUMAN_ID = "local-you";

export function getLocalSeats(mode: OfflineMode, config?: OfflineGameConfig): Player[] {
  const configured = mode === "pass-and-play" ? config?.players : undefined;
  if (configured && (configured.length < 2 || configured.length > 4)) {
    throw new Error("Local games require 2–4 players");
  }
  return Array.from({ length: configured?.length ?? 4 }, (_, index) => ({
    id:
      mode === "solo"
        ? index === 0
          ? LOCAL_HUMAN_ID
          : `local-bot-${index}`
        : `local-${index + 1}`,
    name:
      mode === "solo"
        ? index === 0
          ? "You"
          : ["You", "Eve", "Bob", "Alan"][index]
        : configured?.[index].name.trim() || `Player ${index + 1}`,
    hand: [],
    isBot: mode === "solo" ? index > 0 : (configured?.[index].isBot ?? false),
  }));
}

export function isGameTurnState(value: unknown): boolean {
  return value === "ROUND_FIRST_MOVE" || value === "NEXT_PLAYER_TURN" || value === "PLAY_NEW_ROUND";
}

export function createPlayEvent(
  snapshot: BigTwoGameMachineSnapshot,
  playerId: string,
  cards: Card[],
): GameEvent | undefined {
  switch (snapshot.value) {
    case "ROUND_FIRST_MOVE":
      return { type: "PLAY_FIRST_MOVE", playerId, cards };
    case "NEXT_PLAYER_TURN":
      return { type: "PLAY_CARDS", playerId, cards };
    case "PLAY_NEW_ROUND":
      return { type: "PLAY_NEW_ROUND_FIRST_MOVE", playerId, cards };
    default:
      return undefined;
  }
}

/** Null means no legal play (pass on a following turn); hints never inspect other hands. */
export function getLegalHint(snapshot: BigTwoGameMachineSnapshot, playerId: string): Card[] | null {
  if (!isGameTurnState(snapshot.value)) return null;
  const player = snapshot.context.players[snapshot.context.currentPlayerIndex];
  if (!player || player.id !== playerId || !player.hand.length) return null;
  ensureGameRuntimeCompatibility();
  return chooseBotMove({
    hand: player.hand,
    roundMode: snapshot.value === "NEXT_PLAYER_TURN" ? snapshot.context.roundMode : null,
    cardsToBeat:
      snapshot.value === "NEXT_PLAYER_TURN" ? snapshot.context.cardPile.at(-1) : undefined,
    requiredCard:
      snapshot.value === "ROUND_FIRST_MOVE" ? { suit: "DIAMOND", value: "3" } : undefined,
  });
}

export const getHint = getLegalHint;

export function orderHand(hand: readonly Card[], order: HandOrder = "rank"): Card[] {
  return [...hand].sort((left, right) => {
    const suitDifference =
      order === "suit" ? SUITS.indexOf(left.suit) - SUITS.indexOf(right.suit) : 0;
    return suitDifference || getCardRank(left) - getCardRank(right);
  });
}

/** Rejected actions keep readiness; a successful turn change always requires a new handoff. */
export function getNextReadyPlayerId(
  previous: BigTwoGameMachineSnapshot | undefined,
  next: BigTwoGameMachineSnapshot,
  readyPlayerId: string | undefined,
): string | undefined {
  if (!previous || !isGameTurnState(previous.value) || !isGameTurnState(next.value))
    return undefined;
  const previousId = previous.context.players[previous.context.currentPlayerIndex]?.id;
  const nextId = next.context.players[next.context.currentPlayerIndex]?.id;
  return previousId === nextId && readyPlayerId === nextId ? readyPlayerId : undefined;
}

export function getVisiblePlayerId(
  snapshot: BigTwoGameMachineSnapshot,
  mode: OfflineMode,
  readyPlayerId?: string,
  active = true,
  config?: OfflineGameConfig,
): string | undefined {
  if (!active || snapshot.value === "GAME_END") return undefined;
  if (mode === "solo") return LOCAL_HUMAN_ID;
  const current = snapshot.context.players[snapshot.context.currentPlayerIndex];
  const isBot = getLocalSeats(mode, config).some((seat) => seat.id === current?.id && seat.isBot);
  return !isBot && isGameTurnState(snapshot.value) && current?.id === readyPlayerId
    ? readyPlayerId
    : undefined;
}

/** Resolve a new snapshot so its methods cannot retain the private actor's context. */
export function redactSnapshot(
  snapshot: BigTwoGameMachineSnapshot,
  mode: OfflineMode,
  visiblePlayerId?: string,
  config?: OfflineGameConfig,
): BigTwoGameMachineSnapshot {
  const seats = getLocalSeats(mode, config);
  const redactPlayer = (player: Player): Player => ({
    ...player,
    isBot: seats.some((seat) => seat.id === player.id && seat.isBot),
    hand: player.id === visiblePlayerId ? player.hand.map((card) => ({ ...card })) : [],
  });
  return bigTwoGameMachine.resolveState({
    value: snapshot.value,
    context: {
      ...snapshot.context,
      players: snapshot.context.players.map(redactPlayer),
      cardPile: snapshot.context.cardPile.map((cards) => cards.map((card) => ({ ...card }))),
      winner: snapshot.context.winner ? redactPlayer(snapshot.context.winner) : undefined,
    },
  });
}
