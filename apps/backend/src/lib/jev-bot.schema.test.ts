import { cardSchema, type Card } from "@big-two/game-state-machine";
import { expect, it } from "vite-plus/test";
import { jevBotMoveRequestSchema } from "./jev-bot.schema";

const deck: Card[] = cardSchema.shape.suit.options.flatMap((suit) =>
  cardSchema.shape.value.options.map((value) => ({ suit, value })),
);

it.each([13, 18, 26])("accepts Jev requests for a %i-card hand", (size) => {
  expect(
    jevBotMoveRequestSchema.safeParse({
      hand: deck.slice(0, size),
      playedHands: [],
      roundMode: null,
      opponentHandSizes: size === 26 ? [26] : size === 18 ? [17, 17] : [13, 13, 13],
    }).success,
  ).toBe(true);
});

it("still bounds hand sizes, opponents and the deck, and rejects duplicates", () => {
  for (const invalid of [
    { hand: deck.slice(0, 27), playedHands: [], roundMode: null },
    { hand: [deck[0]], playedHands: [], roundMode: null, opponentHandSizes: [27] },
    { hand: [deck[0]], playedHands: [], roundMode: null, opponentHandSizes: [1, 1, 1, 1] },
    { hand: [deck[0]], playedHands: [[deck[0]]], roundMode: "single" },
    { hand: [deck[0]], playedHands: [], roundMode: "single" },
  ])
    expect(jevBotMoveRequestSchema.safeParse(invalid).success).toBe(false);
});
