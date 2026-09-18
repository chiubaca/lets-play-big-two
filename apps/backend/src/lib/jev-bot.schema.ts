import { cardSchema } from "@big-two/game-state-machine";
import * as z from "zod";

export const jevBotMoveRequestSchema = z
  .object({
    hand: z.array(cardSchema).min(1).max(13),
    playedHands: z.array(z.array(cardSchema).min(1).max(5)).max(52),
    roundMode: z.enum(["single", "pairs", "combo"]).nullable(),
    requiredCard: cardSchema.optional(),
    opponentHandSizes: z.array(z.number().int().min(0).max(13)).max(3).optional(),
  })
  .superRefine(({ hand, playedHands, roundMode }, context) => {
    if (roundMode !== null && playedHands.length === 0) {
      context.addIssue({
        code: "custom",
        message: "A played hand is required when following a trick",
        path: ["playedHands"],
      });
    }

    const cards = [...hand, ...playedHands.flat()];
    const cardKeys = cards.map((card) => `${card.value}:${card.suit}`);
    if (new Set(cardKeys).size !== cardKeys.length) {
      context.addIssue({
        code: "custom",
        message: "The hand and played deck cannot contain duplicate cards",
      });
    }

    if (cards.length > 52) {
      context.addIssue({
        code: "custom",
        message: "The hand and played deck cannot contain more than 52 cards",
      });
    }
  });
