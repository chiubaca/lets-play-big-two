import { describe, expect, it } from "vite-plus/test";
import {
  detectHandType,
  doesHandContainCards,
  isPlayedHandBigger,
  updatePlayersHands,
} from "./game-rules.ts";
import type { Card } from "./card-utils.ts";

const c = (value: Card["value"], suit: Card["suit"]): Card => ({ value, suit });

describe("updatePlayersHands", () => {
  it("removes specified cards from a hand", () => {
    const hand: Card[] = [c("3", "DIAMOND"), c("5", "HEART"), c("K", "SPADE")];
    const result = updatePlayersHands({
      currentHand: hand,
      cardsToRemove: [c("5", "HEART")],
    });
    expect(result).toEqual([c("3", "DIAMOND"), c("K", "SPADE")]);
  });

  it("removes multiple cards from a hand", () => {
    const hand: Card[] = [c("3", "DIAMOND"), c("5", "HEART"), c("K", "SPADE"), c("A", "CLUB")];
    const result = updatePlayersHands({
      currentHand: hand,
      cardsToRemove: [c("3", "DIAMOND"), c("K", "SPADE")],
    });
    expect(result).toEqual([c("5", "HEART"), c("A", "CLUB")]);
  });

  it("returns empty array when all cards are removed", () => {
    const hand: Card[] = [c("3", "DIAMOND")];
    const result = updatePlayersHands({
      currentHand: hand,
      cardsToRemove: [c("3", "DIAMOND")],
    });
    expect(result).toEqual([]);
  });

  it("does not remove cards that are not in the hand", () => {
    const hand: Card[] = [c("3", "DIAMOND"), c("5", "HEART")];
    const result = updatePlayersHands({
      currentHand: hand,
      cardsToRemove: [c("K", "SPADE")],
    });
    expect(result).toEqual([c("3", "DIAMOND"), c("5", "HEART")]);
  });

  it("removes only the requested number of matching cards", () => {
    const duplicate = c("5", "HEART");
    const result = updatePlayersHands({
      currentHand: [duplicate, duplicate, c("K", "SPADE")],
      cardsToRemove: [duplicate],
    });

    expect(result).toEqual([duplicate, c("K", "SPADE")]);
  });
});

describe("doesHandContainCards", () => {
  it("accepts cards that are a subset of the hand", () => {
    expect(
      doesHandContainCards({
        hand: [c("3", "DIAMOND"), c("5", "HEART"), c("K", "SPADE")],
        cards: [c("K", "SPADE"), c("3", "DIAMOND")],
      }),
    ).toBe(true);
  });

  it("rejects a card that is not in the hand", () => {
    expect(
      doesHandContainCards({
        hand: [c("3", "DIAMOND")],
        cards: [c("3", "CLUB")],
      }),
    ).toBe(false);
  });

  it("rejects duplicate selections when the hand has only one matching card", () => {
    expect(
      doesHandContainCards({
        hand: [c("3", "DIAMOND"), c("4", "CLUB")],
        cards: [c("3", "DIAMOND"), c("3", "DIAMOND")],
      }),
    ).toBe(false);
  });
});

describe("detectHandType", () => {
  it("detects a single card", () => {
    expect(detectHandType([c("3", "DIAMOND")])).toBe("single");
  });

  it("detects a valid pair", () => {
    expect(detectHandType([c("5", "HEART"), c("5", "SPADE")])).toBe("pairs");
  });

  it("returns null for an invalid pair (different values)", () => {
    expect(detectHandType([c("5", "HEART"), c("6", "SPADE")])).toBeNull();
  });

  it("detects a straight", () => {
    expect(
      detectHandType([
        c("3", "HEART"),
        c("4", "CLUB"),
        c("5", "DIAMOND"),
        c("6", "SPADE"),
        c("7", "SPADE"),
      ]),
    ).toBe("combo");
  });

  it("detects a flush", () => {
    expect(
      detectHandType([
        c("3", "SPADE"),
        c("4", "SPADE"),
        c("8", "SPADE"),
        c("J", "SPADE"),
        c("K", "SPADE"),
      ]),
    ).toBe("combo");
  });

  it("returns null for 3 cards", () => {
    expect(detectHandType([c("3", "DIAMOND"), c("4", "CLUB"), c("5", "HEART")])).toBeNull();
  });

  it("rejects non-consecutive cards whose sequence values sum to a multiple of 5", () => {
    expect(
      detectHandType([
        c("3", "DIAMOND"),
        c("5", "CLUB"),
        c("7", "HEART"),
        c("9", "SPADE"),
        c("J", "DIAMOND"),
      ]),
    ).toBeNull();
  });
});

describe("isPlayedHandBigger", () => {
  it("compares singles correctly", () => {
    expect(
      isPlayedHandBigger({
        playedCards: [c("K", "SPADE")],
        cardsToBeat: [c("Q", "HEART")],
        handType: "single",
      }),
    ).toBe(true);
  });

  it("compares pairs correctly", () => {
    expect(
      isPlayedHandBigger({
        playedCards: [c("A", "HEART"), c("A", "SPADE")],
        cardsToBeat: [c("K", "DIAMOND"), c("K", "CLUB")],
        handType: "pairs",
      }),
    ).toBe(true);
  });

  it("returns false when played card is smaller", () => {
    expect(
      isPlayedHandBigger({
        playedCards: [c("3", "SPADE")],
        cardsToBeat: [c("2", "DIAMOND")],
        handType: "single",
      }),
    ).toBe(false);
  });

  it("compares combos correctly (higher combo beats lower)", () => {
    // Full house beats flush
    expect(
      isPlayedHandBigger({
        playedCards: [
          c("K", "HEART"),
          c("K", "SPADE"),
          c("K", "DIAMOND"),
          c("Q", "CLUB"),
          c("Q", "SPADE"),
        ],
        cardsToBeat: [
          c("3", "SPADE"),
          c("4", "SPADE"),
          c("8", "SPADE"),
          c("J", "SPADE"),
          c("K", "SPADE"),
        ],
        handType: "combo",
      }),
    ).toBe(true);
  });
});
