import { describe, it, expect, test } from "vitest";

import {
  isFlush,
  isStraight,
  isFullHouse,
  isFourOfAKind,
  validateComboType,
  type CardCombo,
  type ComboType,
  type ValidatedCardCombination,
  isFlushBigger,
  isStraightBigger,
  isFullHouseBigger,
  isFourOfAKindBigger,
  isStraightFlushBigger,
  isComboBigger,
} from "./combo-validators.ts";
import { comboStubs } from "./stubs.ts";
import type { Card } from "./card-utils.ts";

describe("isFlush", () => {
  it("validate a flush", () => {
    const tests: CardCombo[] = [comboStubs.FLUSH_SPADE_K];
    tests.forEach((cardCombo) => {
      const result = isFlush(cardCombo);
      expect(result).toEqual(true);
    });
  });
});

describe("isStraight", () => {
  it("validates a straight", () => {
    const tests: CardCombo[] = [comboStubs.STRAIGHT_3_7, comboStubs.STRAIGHT_10_A];
    tests.forEach((cardCombo) => {
      expect(isStraight(cardCombo)).toEqual(true);
    });
  });
});

describe("isFullHouse", () => {
  test("validates a full house", () => {
    const tests: CardCombo[] = [comboStubs.FULL_HOUSE_J_8];
    tests.forEach((cardCombo) => {
      expect(isFullHouse(cardCombo)).toEqual(true);
    });
  });
  test("invalid full house", () => {
    const tests: CardCombo[] = [
      [
        { value: "K", suit: "HEART" },
        { value: "K", suit: "SPADE" },
        { value: "J", suit: "DIAMOND" },
        { value: "J", suit: "DIAMOND" },
        { value: "8", suit: "SPADE" },
      ],
    ];
    tests.forEach((cardCombo) => {
      expect(isFullHouse(cardCombo)).toEqual(false);
    });
  });
});

describe("isFourOfAKind", () => {
  test("is valid four of a kind", () => {
    const tests: CardCombo[] = [comboStubs.FOUR_OF_A_KIND_J];
    tests.forEach((cardCombo) => {
      expect(isFourOfAKind(cardCombo)).toEqual(true);
    });
  });
  test("it not a valid four of a kind", () => {
    const tests: CardCombo[] = [comboStubs.FLUSH_SPADE_K];
    tests.forEach((cardCombo) => {
      expect(isFourOfAKind(cardCombo)).toEqual(false);
    });
  });
});

describe("validateComboType", () => {
  it("can confirm the correct combo tyoe", () => {
    const tests: [CardCombo, ComboType][] = [
      [comboStubs.FLUSH_SPADE_K, "FLUSH"],
      [comboStubs.STRAIGHT_3_7, "STRAIGHT"],
      [comboStubs.STRAIGHT_10_A, "STRAIGHT"],
      [comboStubs.FULL_HOUSE_J_8, "FULL_HOUSE"],
      [comboStubs.FOUR_OF_A_KIND_J, "FOUR_OF_A_KIND"],
      [comboStubs.STRAIGHT_FLUSH_SPADE_3_7, "STRAIGHT_FLUSH"],
    ];

    tests.forEach(([cardCombo, comboType]) => {
      const result = validateComboType(cardCombo);
      expect(result).toEqual({
        type: comboType,
        cards: cardCombo,
      } satisfies ValidatedCardCombination);
    });
  });

  it("detects invalid combos", () => {
    const tests: Card[][] = [
      [
        { suit: "CLUB", value: "2" },
        { suit: "HEART", value: "3" },
        { suit: "CLUB", value: "7" },
        { suit: "DIAMOND", value: "9" },
        { suit: "CLUB", value: "J" },
        { suit: "HEART", value: "A" },
      ],
      [
        { suit: "CLUB", value: "2" },
        { suit: "CLUB", value: "3" },
      ],
      [{ suit: "CLUB", value: "2" }],
    ];

    tests.forEach((cards) => {
      const result = validateComboType(cards);
      const expectedResult = null;
      expect(result).toEqual(expectedResult);
    });
  });
});

describe("test same combo compare helpers", () => {
  test("isFlushBigger", () => {
    const tests: [CardCombo, CardCombo, boolean][] = [
      [comboStubs.FLUSH_SPADE_K, comboStubs.FLUSH_DIAMOND_Q, true],
      [comboStubs.FLUSH_HEART_2, comboStubs.FLUSH_SPADE_K, false],
      [comboStubs.FLUSH_CLUB_K, comboStubs.FLUSH_SPADE_K, false],
      [comboStubs.FLUSH_SPADE_K, comboStubs.FLUSH_SPADE_2, false],
      [comboStubs.FLUSH_HEART_K, comboStubs.FLUSH_CLUB_2, true],
    ];
    tests.forEach(([baseCombo, comparisonCombo, expectedResult]) => {
      const result = isFlushBigger(baseCombo, comparisonCombo);
      expect(result).toEqual(expectedResult);
    });
  });

  test("isStraightBigger", () => {
    const tests: [CardCombo, CardCombo, boolean][] = [
      [comboStubs.STRAIGHT_10_A, comboStubs.STRAIGHT_3_7, true],
      [comboStubs.STRAIGHT_7_J, comboStubs.STRAIGHT_5_9, true],
      [comboStubs.STRAIGHT_3_7, comboStubs.STRAIGHT_5_9, false],
    ];
    tests.forEach(([baseCombo, comparisonCombo, expectedResult]) => {
      const result = isStraightBigger(baseCombo, comparisonCombo);
      expect(result).toEqual(expectedResult);
    });
  });

  test("isFullHouseBigger", () => {
    const tests: [CardCombo, CardCombo, boolean][] = [
      [comboStubs.FULL_HOUSE_10_4, comboStubs.FULL_HOUSE_J_8, false],
      [comboStubs.FULL_HOUSE_A_2, comboStubs.FULL_HOUSE_K_Q, true],
      [comboStubs.FULL_HOUSE_J_8, comboStubs.FULL_HOUSE_10_4, true],
      [comboStubs.FULL_HOUSE_2_A, comboStubs.FULL_HOUSE_6_5, true],
    ];
    tests.forEach(([baseCombo, comparisonCombo, expectedResult]) => {
      const result = isFullHouseBigger(baseCombo, comparisonCombo);
      expect(result).toEqual(expectedResult);
    });
  });

  test("isFourOfAKindBigger", () => {
    const tests: [CardCombo, CardCombo, boolean][] = [
      [comboStubs.FOUR_OF_A_KIND_J, comboStubs.FOUR_OF_A_KIND_K, false],
      [comboStubs.FOUR_OF_A_KIND_A, comboStubs.FOUR_OF_A_KIND_Q, true],
    ];
    tests.forEach(([baseCombo, comparisonCombo, expectedResult]) => {
      const result = isFourOfAKindBigger(baseCombo, comparisonCombo);
      expect(result).toEqual(expectedResult);
    });
  });

  test("isStraightFlushBigger", () => {
    const tests: [CardCombo, CardCombo, boolean][] = [
      [comboStubs.STRAIGHT_FLUSH_CLUB_4_8, comboStubs.STRAIGHT_FLUSH_DIAMOND_9_K, false],
      [comboStubs.STRAIGHT_FLUSH_HEART_6_10, comboStubs.STRAIGHT_FLUSH_DIAMOND_9_K, false],
      [comboStubs.STRAIGHT_FLUSH_CLUB_5_9, comboStubs.STRAIGHT_FLUSH_CLUB_4_8, true],
    ];
    tests.forEach(([baseCombo, comparisonCombo, expectedResult]) => {
      const result = isStraightFlushBigger(baseCombo, comparisonCombo);
      expect(result).toEqual(expectedResult);
    });
  });
});

describe.skip("isComboBigger", () => {
  test("same combo types", () => {
    const tests: [ValidatedCardCombination, ValidatedCardCombination, boolean][] = [
      [
        {
          type: "FLUSH",
          cards: comboStubs.FLUSH_CLUB_K,
        },
        {
          type: "FLUSH",
          cards: comboStubs.FLUSH_SPADE_2,
        },
        false,
      ],
      [
        {
          type: "STRAIGHT",
          cards: comboStubs.STRAIGHT_3_7,
        },
        {
          type: "STRAIGHT",
          cards: comboStubs.STRAIGHT_7_J,
        },
        false,
      ],
      [
        {
          type: "FULL_HOUSE",
          cards: comboStubs.FULL_HOUSE_A_2,
        },
        {
          type: "FULL_HOUSE",
          cards: comboStubs.FULL_HOUSE_K_Q,
        },
        true,
      ],
      [
        {
          type: "STRAIGHT_FLUSH",
          cards: comboStubs.STRAIGHT_FLUSH_CLUB_4_8,
        },
        {
          type: "STRAIGHT_FLUSH",
          cards: comboStubs.STRAIGHT_FLUSH_CLUB_5_9,
        },
        false,
      ],
    ];
    tests.forEach(([baseCombo, comparisonCombo, expectedResult]) => {
      const result = isComboBigger(baseCombo, comparisonCombo);
      expect(result).toEqual(expectedResult);
    });
  });

  test("different combo types", () => {
    const tests: [ValidatedCardCombination, ValidatedCardCombination, boolean][] = [
      [
        {
          type: "FLUSH",
          cards: comboStubs.FLUSH_CLUB_K,
        },
        {
          type: "FULL_HOUSE",
          cards: comboStubs.FULL_HOUSE_K_Q,
        },
        false,
      ],
      [
        {
          type: "STRAIGHT",
          cards: comboStubs.STRAIGHT_3_7,
        },
        {
          type: "STRAIGHT_FLUSH",
          cards: comboStubs.STRAIGHT_FLUSH_CLUB_5_9,
        },
        false,
      ],
      [
        {
          type: "STRAIGHT_FLUSH",
          cards: comboStubs.STRAIGHT_FLUSH_HEART_6_10,
        },
        {
          type: "FULL_HOUSE",
          cards: comboStubs.FULL_HOUSE_K_Q,
        },
        true,
      ],
      [
        {
          type: "STRAIGHT",
          cards: comboStubs.STRAIGHT_10_A,
        },
        {
          type: "FLUSH",
          cards: comboStubs.FLUSH_CLUB_K,
        },
        true,
      ],
    ];
    tests.forEach(([baseCombo, comparisonCombo, expectedResult]) => {
      const result = isComboBigger(baseCombo, comparisonCombo);
      expect(result).toEqual(expectedResult);
    });
  });
});
