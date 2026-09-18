import type { BigTwoGameMachineSnapshot, Card } from "@big-two/game-state-machine";

import { honoClient } from "~/libs/hono-client";
import { getRequiredCard } from "./game-room-session";

export type JevBotMoveDecision = {
  cards: Card[] | null;
  source: "forced" | "fallback" | "jev";
  confidence?: number;
  model?: string;
  trace?: {
    selectedAction: string;
    questions: Record<
      string,
      {
        choice: string;
        confidence: number;
        probabilities: Record<string, number>;
        options: Record<string, string>;
      }
    >;
  };
};

export async function requestJevBotMove(
  gameState: BigTwoGameMachineSnapshot,
  playerId: string,
): Promise<JevBotMoveDecision> {
  const player = gameState.context.players.find((entry) => entry.id === playerId);
  if (!player) throw new Error("Cannot request a Jev move for an unknown player");

  const response = await honoClient.api.bot.jev.move.$post({
    json: {
      hand: player.hand,
      playedHands: gameState.context.cardPile,
      roundMode: gameState.context.roundMode,
      requiredCard: getRequiredCard(gameState),
      opponentHandSizes: gameState.context.players
        .filter((entry) => entry.id !== playerId)
        .map((entry) => entry.hand.length),
    },
  });

  if (!response.ok) throw new Error(`Jev move request failed with status ${response.status}`);
  return response.json();
}
