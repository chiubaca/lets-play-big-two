import type { Card } from "@big-two/game-core";
import { describe, expect, it } from "vite-plus/test";

import { chooseBotMove, getLegalPlays } from "./game-ai.ts";

const card = (value: Card["value"], suit: Card["suit"]): Card => ({ value, suit });

const threeOfDiamonds = card("3", "DIAMOND");
const threeOfClubs = card("3", "CLUB");
const fourOfHearts = card("4", "HEART");
const fiveOfDiamonds = card("5", "DIAMOND");
const sixOfClubs = card("6", "CLUB");
const sevenOfSpades = card("7", "SPADE");

describe("getLegalPlays", () => {
  it("enumerates every single, pair, and five-card combination when leading", () => {
    const hand = [
      sevenOfSpades,
      threeOfClubs,
      fiveOfDiamonds,
      threeOfDiamonds,
      sixOfClubs,
      fourOfHearts,
    ];

    expect(getLegalPlays({ hand, roundMode: null })).toEqual([
      [threeOfDiamonds],
      [threeOfClubs],
      [fourOfHearts],
      [fiveOfDiamonds],
      [sixOfClubs],
      [sevenOfSpades],
      [threeOfDiamonds, threeOfClubs],
      [threeOfDiamonds, fourOfHearts, fiveOfDiamonds, sixOfClubs, sevenOfSpades],
      [threeOfClubs, fourOfHearts, fiveOfDiamonds, sixOfClubs, sevenOfSpades],
    ]);
  });

  it("only returns leading moves containing the required 3 of diamonds", () => {
    const hand = [
      sevenOfSpades,
      threeOfClubs,
      fiveOfDiamonds,
      threeOfDiamonds,
      sixOfClubs,
      fourOfHearts,
    ];

    expect(
      getLegalPlays({
        hand,
        roundMode: null,
        requiredCard: card("3", "DIAMOND"),
      }),
    ).toEqual([
      [threeOfDiamonds],
      [threeOfDiamonds, threeOfClubs],
      [threeOfDiamonds, fourOfHearts, fiveOfDiamonds, sixOfClubs, sevenOfSpades],
    ]);
  });

  it("returns only singles that beat the current single, weakest first", () => {
    const fourOfDiamonds = card("4", "DIAMOND");
    const fourOfSpades = card("4", "SPADE");

    expect(
      getLegalPlays({
        hand: [fiveOfDiamonds, fourOfDiamonds, fourOfSpades, threeOfDiamonds],
        roundMode: "single",
        cardsToBeat: [card("4", "HEART")],
      }),
    ).toEqual([[fourOfSpades], [fiveOfDiamonds]]);
  });

  it("returns only valid pairs that beat the current pair", () => {
    const sixOfDiamonds = card("6", "DIAMOND");
    const sixOfHearts = card("6", "HEART");

    expect(
      getLegalPlays({
        hand: [card("5", "CLUB"), sixOfHearts, card("5", "DIAMOND"), sixOfDiamonds],
        roundMode: "pairs",
        cardsToBeat: [card("5", "HEART"), card("5", "SPADE")],
      }),
    ).toEqual([[sixOfDiamonds, sixOfHearts]]);
  });

  it("returns a five-card combination that beats the current combination", () => {
    const fullHouse = [
      card("6", "DIAMOND"),
      card("6", "HEART"),
      card("6", "SPADE"),
      card("5", "DIAMOND"),
      card("5", "HEART"),
    ];
    const flush = [
      card("4", "DIAMOND"),
      card("6", "DIAMOND"),
      card("9", "DIAMOND"),
      card("J", "DIAMOND"),
      card("Q", "DIAMOND"),
    ];

    expect(getLegalPlays({ hand: fullHouse, roundMode: "combo", cardsToBeat: flush })).toEqual([
      [fullHouse[3], fullHouse[4], fullHouse[0], fullHouse[1], fullHouse[2]],
    ]);
  });

  it("requires cardsToBeat to match the active round mode", () => {
    expect(getLegalPlays({ hand: [fiveOfDiamonds], roundMode: "single" })).toEqual([]);
    expect(
      getLegalPlays({
        hand: [fiveOfDiamonds],
        roundMode: "single",
        cardsToBeat: [card("4", "DIAMOND"), card("4", "CLUB")],
      }),
    ).toEqual([]);
  });

  it("does not mutate the hand, cards to beat, required card, or their card objects", () => {
    const hand = [
      card("9", "SPADE"),
      card("5", "CLUB"),
      card("8", "HEART"),
      card("7", "DIAMOND"),
      card("6", "SPADE"),
    ];
    const cardsToBeat = [
      card("3", "HEART"),
      card("4", "CLUB"),
      card("5", "DIAMOND"),
      card("6", "SPADE"),
      card("7", "SPADE"),
    ];
    const requiredCard = hand[1];
    const originalHand = hand.map((entry) => ({ ...entry }));
    const originalCardsToBeat = cardsToBeat.map((entry) => ({ ...entry }));
    const originalRequiredCard = { ...requiredCard };

    hand.forEach(Object.freeze);
    cardsToBeat.forEach(Object.freeze);
    Object.freeze(hand);
    Object.freeze(cardsToBeat);

    getLegalPlays({ hand, roundMode: "combo", cardsToBeat, requiredCard });
    chooseBotMove({ hand, roundMode: "combo", cardsToBeat, requiredCard });

    expect(hand).toEqual(originalHand);
    expect(cardsToBeat).toEqual(originalCardsToBeat);
    expect(requiredCard).toEqual(originalRequiredCard);
  });
});

describe("chooseBotMove", () => {
  it("chooses the weakest legal move deterministically", () => {
    expect(
      chooseBotMove({
        hand: [card("A", "SPADE"), card("6", "CLUB"), card("6", "DIAMOND")],
        roundMode: "pairs",
        cardsToBeat: [card("5", "HEART"), card("5", "SPADE")],
      }),
    ).toEqual([card("6", "DIAMOND"), card("6", "CLUB")]);
  });

  it("returns null when there is no legal move", () => {
    const request = {
      hand: [card("2", "HEART"), card("A", "SPADE")],
      roundMode: "single" as const,
      cardsToBeat: [card("2", "SPADE")],
    };

    expect(getLegalPlays(request)).toEqual([]);
    expect(chooseBotMove(request)).toBeNull();
  });
});
