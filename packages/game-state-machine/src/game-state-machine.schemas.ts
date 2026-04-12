import * as z from "zod";
import { CARD_VALUES, SUITS } from "@big-two/game-core";

export const cardSchema = z.object({
  suit: z.enum(SUITS),
  value: z.enum(CARD_VALUES),
});

export const gameEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("JOIN_GAME"),
    playerId: z.string(),
    playerName: z.string(),
  }),
  z.object({ type: z.literal("START_GAME") }),
  z.object({ type: z.literal("ROUND_FIRST_MOVE") }),
  z.object({ type: z.literal("PLAY_FIRST_MOVE"), cards: z.array(cardSchema) }),
  z.object({
    type: z.literal("PLAY_NEW_ROUND_FIRST_MOVE"),
    cards: z.array(cardSchema),
  }),
  z.object({ type: z.literal("PLAY_CARDS"), cards: z.array(cardSchema) }),
  z.object({ type: z.literal("PASS_TURN"), playerId: z.string() }),
  z.object({ type: z.literal("RESET_GAME") }),
  z.object({ type: z.literal("GAME_END") }),
]);
