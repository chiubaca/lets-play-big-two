import { CARD_VALUES, getCardKey, SUITS, type Card } from "@big-two/game-core";
import {
  bigTwoGameMachine,
  type BigTwoGameMachineSnapshot,
  type GameContext,
} from "@big-two/game-state-machine";
import {
  getLocalSeats,
  isGameTurnState,
  type OfflineGameConfig,
  type OfflineMode,
} from "./game-helpers";

export interface LocalGameStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export function getStorageKey(mode: OfflineMode): string {
  return `@big-two/native-game/v1/${mode}`;
}

export function serializeGame(
  snapshot: BigTwoGameMachineSnapshot,
  mode: OfflineMode,
  config?: OfflineGameConfig,
): string {
  const seats = getLocalSeats(mode, config);
  const context = {
    ...snapshot.context,
    players: snapshot.context.players.map((player, index) => ({
      ...player,
      isBot: seats[index].isBot,
    })),
  };
  return JSON.stringify({ version: 1, mode, value: snapshot.value, context });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCard(value: unknown): value is Card {
  return (
    isRecord(value) &&
    SUITS.some((suit) => suit === value.suit) &&
    CARD_VALUES.some((rank) => rank === value.value)
  );
}

/** Only restore complete, valid local tables; never trust arbitrary persisted machine internals. */
export function restoreGame(
  serialized: string,
  mode: OfflineMode,
  config?: OfflineGameConfig,
): BigTwoGameMachineSnapshot {
  const saved: unknown = JSON.parse(serialized);
  if (
    !isRecord(saved) ||
    saved.version !== 1 ||
    saved.mode !== mode ||
    (!isGameTurnState(saved.value) && saved.value !== "GAME_END") ||
    !isRecord(saved.context)
  ) {
    throw new Error("Invalid saved game");
  }
  const context = saved.context;
  const seats = getLocalSeats(mode, config);
  if (
    !Array.isArray(context.players) ||
    context.players.length !== seats.length ||
    !context.players.every(
      (player, index) =>
        isRecord(player) &&
        player.id === seats[index].id &&
        player.name === seats[index].name &&
        player.isBot === seats[index].isBot &&
        Array.isArray(player.hand) &&
        player.hand.length <= Math.ceil(52 / seats.length) &&
        player.hand.every(isCard),
    ) ||
    !Number.isInteger(context.currentPlayerIndex) ||
    Number(context.currentPlayerIndex) < 0 ||
    Number(context.currentPlayerIndex) >= seats.length ||
    !Array.isArray(context.cardPile) ||
    !context.cardPile.every(
      (cards) => Array.isArray(cards) && [1, 2, 5].includes(cards.length) && cards.every(isCard),
    ) ||
    !Number.isInteger(context.consecutivePasses) ||
    Number(context.consecutivePasses) < 0 ||
    Number(context.consecutivePasses) >= seats.length - 1 ||
    ![null, "single", "pairs", "combo"].includes(context.roundMode as string | null)
  ) {
    throw new Error("Invalid saved game context");
  }
  const cards = [...context.players.flatMap((player) => player.hand), ...context.cardPile.flat()];
  if (cards.length !== 52 || new Set(cards.map(getCardKey)).size !== 52) {
    throw new Error("Invalid saved deck");
  }
  const gameContext = context as unknown as GameContext;
  const winner = gameContext.players.find((player) => player.hand.length === 0);
  if (
    (saved.value === "GAME_END") !== Boolean(winner) ||
    (saved.value === "NEXT_PLAYER_TURN" &&
      (context.roundMode === null || !context.cardPile.length)) ||
    (saved.value !== "NEXT_PLAYER_TURN" &&
      saved.value !== "GAME_END" &&
      context.roundMode !== null) ||
    (saved.value === "ROUND_FIRST_MOVE" &&
      (context.cardPile.length !== 0 ||
        !gameContext.players[gameContext.currentPlayerIndex].hand.some(
          (card) => card.suit === "DIAMOND" && card.value === "3",
        )))
  ) {
    throw new Error("Invalid saved turn");
  }
  return bigTwoGameMachine.resolveState({
    value: saved.value as BigTwoGameMachineSnapshot["value"],
    context: { ...gameContext, winner, guardMessage: undefined },
  });
}
