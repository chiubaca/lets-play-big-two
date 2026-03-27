import type { Card } from "@big-two/game-core";
import type { SnapshotFrom } from "xstate";
import type { bigTwoGameMachine } from "./game-state-machine.ts";

export type BigTwoGameMachine = typeof bigTwoGameMachine;

export type BigTwoGameMachineSnapshot = SnapshotFrom<BigTwoGameMachine>;

export type GameEvent =
  | { type: "JOIN_GAME"; playerId: string; playerName: string }
  | { type: "START_GAME" }
  | { type: "ROUND_FIRST_MOVE" }
  | { type: "PLAY_FIRST_MOVE"; cards: Card[] }
  | { type: "PLAY_NEW_ROUND_FIRST_MOVE"; cards: Card[] }
  | { type: "PLAY_CARDS"; cards: Card[] }
  | { type: "PASS_TURN"; playerId: string }
  | { type: "RESET_GAME" }
  | { type: "GAME_END" };

export type Player = {
  name: string;
  id: string;
  hand: Card[];
};

export type RoundMode = "single" | "pairs" | "combo";

export interface GameContext {
  players: Player[];
  currentPlayerIndex: number;
  roundMode: RoundMode | null;
  cardPile: Card[][];
  consecutivePasses: number;
  winner?: Player;
  guardMessage?: string;
}
