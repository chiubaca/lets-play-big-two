import type { Card, GameEvent, BigTwoGameMachineSnapshot } from "@big-two/game-state-machine";

export const GAME_TURN_STATES = ["ROUND_FIRST_MOVE", "NEXT_PLAYER_TURN", "PLAY_NEW_ROUND"] as const;

export type GameTurnState = (typeof GAME_TURN_STATES)[number];

export function isGameTurnState(value: unknown): value is GameTurnState {
  return GAME_TURN_STATES.includes(value as GameTurnState);
}

export function createPlayEvent(
  gameState: BigTwoGameMachineSnapshot,
  playerId: string,
  cards: Card[],
): GameEvent | undefined {
  switch (gameState.value) {
    case "ROUND_FIRST_MOVE":
      return { type: "PLAY_FIRST_MOVE", playerId, cards } satisfies GameEvent;
    case "NEXT_PLAYER_TURN":
      return { type: "PLAY_CARDS", playerId, cards } satisfies GameEvent;
    case "PLAY_NEW_ROUND":
      return { type: "PLAY_NEW_ROUND_FIRST_MOVE", playerId, cards } satisfies GameEvent;
    default:
      return undefined;
  }
}

export function getCardsToBeat(gameState: BigTwoGameMachineSnapshot): Card[] | undefined {
  return gameState.value === "NEXT_PLAYER_TURN" ? gameState.context.cardPile.at(-1) : undefined;
}

export function getRequiredCard(gameState: BigTwoGameMachineSnapshot): Card | undefined {
  return gameState.value === "ROUND_FIRST_MOVE" ? { suit: "DIAMOND", value: "3" } : undefined;
}
