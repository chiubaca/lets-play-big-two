import { describe, it, expect } from "vitest";
import {
  sortCards,
  createDeck,
  getCardRank,
  getComparisonCardValue,
  isSingleBigger,
  isPairBigger,
  type Pairs,
  type Card,
  getSequenceValue,
} from "./card-utils.ts";

describe("createDeck", () => {
  const deck = createDeck();
  it("return 52 cards", () => {
    expect(deck.length).toBe(52);
  });
});

describe("getCardRank", () => {
  const tests: [Card, number][] = [
    [{ value: "3", suit: "DIAMOND" }, 1],
    [{ value: "3", suit: "CLUB" }, 2],
    [{ value: "3", suit: "HEART" }, 3],
    [{ value: "3", suit: "SPADE" }, 4],
    [{ value: "4", suit: "DIAMOND" }, 5],
    [{ value: "4", suit: "CLUB" }, 6],
    [{ value: "4", suit: "HEART" }, 7],
    [{ value: "2", suit: "SPADE" }, 52],
  ];

  tests.forEach(([card, expectedValue]) => {
    it(`returns ${expectedValue} for ${card.value} of ${card.suit}`, () => {
      const result = getCardRank(card);
      expect(result).toEqual(expectedValue);
    });
  });
});

describe("compareCards", () => {
  it("Base cards are higher than comparison cards", () => {
    const tests: [Card, Card, number][] = [
      [{ value: "3", suit: "CLUB" }, { value: "3", suit: "DIAMOND" }, 1],
      [{ value: "3", suit: "HEART" }, { value: "3", suit: "DIAMOND" }, 2],
      [{ value: "3", suit: "SPADE" }, { value: "3", suit: "DIAMOND" }, 3],
      [{ value: "4", suit: "CLUB" }, { value: "3", suit: "DIAMOND" }, 5],
      [{ value: "2", suit: "SPADE" }, { value: "3", suit: "DIAMOND" }, 51],
    ];
    tests.forEach(([baseCard, comparisonCard, expectedValue]) => {
      const result = getComparisonCardValue(baseCard, comparisonCard);
      expect(result).toEqual(expectedValue);
    });
  });
  it("Base cards are  lower than comparison cards", () => {
    const tests: [Card, Card, number][] = [
      [{ value: "3", suit: "DIAMOND" }, { value: "3", suit: "CLUB" }, -1],
      [{ value: "3", suit: "DIAMOND" }, { value: "3", suit: "HEART" }, -2],
      [{ value: "3", suit: "DIAMOND" }, { value: "3", suit: "SPADE" }, -3],
      [{ value: "3", suit: "DIAMOND" }, { value: "4", suit: "CLUB" }, -5],
      [{ value: "3", suit: "DIAMOND" }, { value: "2", suit: "SPADE" }, -51],
    ];
    tests.forEach(([baseCard, comparisonCard, expectedValue]) => {
      const result = getComparisonCardValue(baseCard, comparisonCard);
      expect(result).toEqual(expectedValue);
    });
  });
});

describe("sortCards", () => {
  it("should sort cards with all the same suit", () => {
    const result = sortCards([
      { suit: "DIAMOND", value: "2" },
      { suit: "DIAMOND", value: "5" },
      { suit: "DIAMOND", value: "7" },
      { suit: "DIAMOND", value: "K" },
      { suit: "DIAMOND", value: "6" },
    ]);

    const expectedValue = [
      { suit: "DIAMOND", value: "5" },
      { suit: "DIAMOND", value: "6" },
      { suit: "DIAMOND", value: "7" },
      { suit: "DIAMOND", value: "K" },
      { suit: "DIAMOND", value: "2" },
    ];

    expect(result).toEqual(expectedValue);
  });

  it("should sort cards with different suits", () => {
    const result = sortCards([
      { suit: "HEART", value: "A" },
      { suit: "SPADE", value: "K" },
      { suit: "CLUB", value: "Q" },
      { suit: "DIAMOND", value: "J" },
      { suit: "HEART", value: "10" },
    ]);

    const expectedValue = [
      { suit: "HEART", value: "10" },
      { suit: "DIAMOND", value: "J" },
      { suit: "CLUB", value: "Q" },
      { suit: "SPADE", value: "K" },
      { suit: "HEART", value: "A" },
    ];

    expect(result).toEqual(expectedValue);
  });

  it("should sort cards with same values but different suits", () => {
    const result = sortCards([
      { suit: "SPADE", value: "7" },
      { suit: "CLUB", value: "7" },
      { suit: "DIAMOND", value: "7" },
      { suit: "HEART", value: "7" },
    ]);

    const expectedValue = [
      { suit: "DIAMOND", value: "7" },
      { suit: "CLUB", value: "7" },
      { suit: "HEART", value: "7" },
      { suit: "SPADE", value: "7" },
    ];

    expect(result).toEqual(expectedValue);
  });

  it("should handle empty array", () => {
    const result = sortCards([]);
    expect(result).toEqual([]);
  });

  it("should handle single card array", () => {
    const result = sortCards([{ suit: "HEART", value: "A" }]);
    expect(result).toEqual([{ suit: "HEART", value: "A" }]);
  });
});

describe("isSingleBigger", () => {
  it("Base cards are higher than comparison cards", () => {
    const tests: [Card, Card, boolean][] = [
      [{ value: "A", suit: "HEART" }, { value: "K", suit: "SPADE" }, true],
      [{ value: "J", suit: "CLUB" }, { value: "10", suit: "HEART" }, true],
      [{ value: "Q", suit: "DIAMOND" }, { value: "J", suit: "SPADE" }, true],
      [{ value: "2", suit: "CLUB" }, { value: "A", suit: "HEART" }, true],
      [{ value: "5", suit: "SPADE" }, { value: "5", suit: "HEART" }, true],
      [{ value: "8", suit: "DIAMOND" }, { value: "7", suit: "CLUB" }, true],
      [{ value: "K", suit: "SPADE" }, { value: "K", suit: "HEART" }, true],
    ];
    tests.forEach(([baseCard, comparisonCard, expectedValue]) => {
      const result = isSingleBigger(baseCard, comparisonCard);
      expect(result).toEqual(expectedValue);
    });
  });
  it("Base cards are lower than or equal to comparison cards", () => {
    const tests: [Card, Card, boolean][] = [
      [{ value: "K", suit: "SPADE" }, { value: "A", suit: "HEART" }, false],
      [{ value: "10", suit: "HEART" }, { value: "J", suit: "CLUB" }, false],
      [{ value: "J", suit: "SPADE" }, { value: "Q", suit: "DIAMOND" }, false],
      [{ value: "A", suit: "HEART" }, { value: "2", suit: "CLUB" }, false],
      [{ value: "5", suit: "HEART" }, { value: "5", suit: "SPADE" }, false],
      [{ value: "7", suit: "CLUB" }, { value: "8", suit: "DIAMOND" }, false],
      [{ value: "K", suit: "HEART" }, { value: "K", suit: "SPADE" }, false],
    ];
    tests.forEach(([baseCard, comparisonCard, expectedValue]) => {
      const result = isSingleBigger(baseCard, comparisonCard);
      expect(result).toEqual(expectedValue);
    });
  });
});

describe("isDoubleBigger", () => {
  it("base double is higher than comparison double", () => {
    const tests: [Pairs, Pairs, boolean][] = [
      [
        [
          { value: "A", suit: "HEART" },
          { value: "A", suit: "SPADE" },
        ],
        [
          { value: "K", suit: "DIAMOND" },
          { value: "K", suit: "CLUB" },
        ],
        true,
      ],
      [
        [
          { value: "2", suit: "CLUB" },
          { value: "2", suit: "DIAMOND" },
        ],
        [
          { value: "A", suit: "HEART" },
          { value: "A", suit: "SPADE" },
        ],
        true,
      ],
      [
        [
          { value: "J", suit: "SPADE" },
          { value: "J", suit: "HEART" },
        ],
        [
          { value: "10", suit: "CLUB" },
          { value: "10", suit: "DIAMOND" },
        ],
        true,
      ],
      [
        [
          { value: "Q", suit: "DIAMOND" },
          { value: "Q", suit: "CLUB" },
        ],
        [
          { value: "J", suit: "SPADE" },
          { value: "J", suit: "HEART" },
        ],
        true,
      ],
      [
        [
          { value: "8", suit: "HEART" },
          { value: "8", suit: "SPADE" },
        ],
        [
          { value: "8", suit: "DIAMOND" },
          { value: "8", suit: "CLUB" },
        ],
        true,
      ],
    ];

    tests.forEach(([basePair, comparisonPair, expectedValue]) => {
      const result = isPairBigger(basePair, comparisonPair);
      expect(result).toEqual(expectedValue);
    });
  });
});

describe("getSequenceValue", () => {
  const tests: [Card, number][] = [
    [{ value: "3", suit: "CLUB" }, 1],
    [{ value: "6", suit: "DIAMOND" }, 4],
    [{ value: "2", suit: "CLUB" }, 13],
  ];
  tests.forEach(([card, expectedValue]) => {
    it(`returns ${expectedValue} for ${card.value} of ${card.suit}`, () => {
      const result = getSequenceValue(card);
      expect(result).toEqual(expectedValue);
    });
  });
});
