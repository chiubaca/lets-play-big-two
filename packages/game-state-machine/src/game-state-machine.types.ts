import type { Card } from "@big-two/game-core";
import type { SnapshotFrom } from "xstate";
import type * as z from "zod";
import type { bigTwoGameMachine } from "./game-state-machine.ts";
import type { gameEventSchema } from "./game-state-machine.schemas.ts";

export type BigTwoGameMachine = typeof bigTwoGameMachine;

export type BigTwoGameMachineSnapshot = SnapshotFrom<BigTwoGameMachine>;

export type GameEvent = z.infer<typeof gameEventSchema>;

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
