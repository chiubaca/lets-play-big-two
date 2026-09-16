import * as z from "zod";
import { CARD_VALUES, SUITS } from "@big-two/game-core";

export const cardSchema = z.object({
  suit: z.enum(SUITS),
  value: z.enum(CARD_VALUES),
});

export const gameEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("JOIN_GAME"),
    playerId: z.string().min(1),
    playerName: z.string().min(1),
  }),
  z.object({ type: z.literal("START_GAME") }),
  z.object({
    type: z.literal("PLAY_FIRST_MOVE"),
    playerId: z.string().min(1),
    cards: z.array(cardSchema).min(1).max(5),
  }),
  z.object({
    type: z.literal("PLAY_NEW_ROUND_FIRST_MOVE"),
    playerId: z.string().min(1),
    cards: z.array(cardSchema).min(1).max(5),
  }),
  z.object({
    type: z.literal("PLAY_CARDS"),
    playerId: z.string().min(1),
    cards: z.array(cardSchema).min(1).max(5),
  }),
  z.object({ type: z.literal("PASS_TURN"), playerId: z.string().min(1) }),
  z.object({ type: z.literal("RESET_GAME") }),
]);
