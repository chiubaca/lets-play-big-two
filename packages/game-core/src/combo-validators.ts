import {
  getComparisonCardValue,
  getSequenceValue,
  sortCards,
  SUITS,
  type Card,
} from "./card-utils.ts";

export type CardCombo = [Card, Card, Card, Card, Card];
export type ComboType = "STRAIGHT" | "FLUSH" | "FULL_HOUSE" | "FOUR_OF_A_KIND" | "STRAIGHT_FLUSH";

export function isFlush(cardCombo: CardCombo): boolean {
  return cardCombo.every((card) => card.suit === cardCombo[0].suit);
}

export function isStraight(cardCombo: CardCombo): boolean {
  // NOTE this implementation does not account for bicycle straights e.g:
  // A,2,3,4,5
  const cardValueSum = cardCombo.reduce((valueSum, currentCard) => {
    return getSequenceValue(currentCard) + valueSum;
  }, 0);
  return cardValueSum % 5 === 0;
}

export function isFullHouse(cardCombo: CardCombo): boolean {
  /**
   * We build up an hashmap to count unique card values
   * the end object will looks something like:
   * {
   *   "K":2,
   *   "5": 3
   * }
   */
  const valueCounts: { [key: string]: number } = {};
  for (const card of cardCombo) {
    valueCounts[card.value] = (valueCounts[card.value] || 0) + 1;
    /**
     * Here we convert the hashmap key into array, e.g: [K,5]
     * if at any point this array becomes greater than 2 we can exit early.
     */
    if (Object.keys(valueCounts).length > 2) return false;
  }

  /**
   * Here we create an array of just the counts and we check we're
   * getting a count of 2 and 3.
   */
  const counts = Object.values(valueCounts).toSorted((a, b) => a - b);
  return counts[0] === 2 && counts[1] === 3;
}

export function isFourOfAKind(cardCombo: CardCombo): boolean {
  // all this logic is the same as isFullHouse.
  const valueCounts: { [key: string]: number } = {};
  for (const card of cardCombo) {
    valueCounts[card.value] = (valueCounts[card.value] || 0) + 1;
    /**
     * Here we convert the hashmap key into array, e.g: [K,5]
     * if at any point this array becomes greater than 2 we can exit early.
     */
    if (Object.keys(valueCounts).length > 2) return false;
  }
  const counts = Object.values(valueCounts).toSorted((a, b) => a - b);
  return counts[0] === 1 && counts[1] === 4;
}

export type ValidatedCardCombination = {
  type: ComboType;
  cards: CardCombo;
};

/**
 * Validate the type of combo from a given set of cards.
 * Invalid combos will be returned as null.
 */
export function validateComboType(cardCombo: Card[]): ValidatedCardCombination | null {
  if (cardCombo.length !== 5) return null;

  const cards = cardCombo as CardCombo;

  if (isFlush(cards) && isStraight(cards)) return { type: "STRAIGHT_FLUSH", cards };
  if (isFourOfAKind(cards)) return { type: "FOUR_OF_A_KIND", cards };
  if (isFullHouse(cards)) return { type: "FULL_HOUSE", cards };
  if (isFlush(cards)) return { type: "FLUSH", cards };
  if (isStraight(cards)) return { type: "STRAIGHT", cards };
  return null;
}

export function isFlushBigger(baseCardCombo: CardCombo, comparisonCardCombo: CardCombo): boolean {
  // Compare suits if they're different first
  const baseCardComboSuit = baseCardCombo[0].suit;
  const comparisonCardComboSuit = comparisonCardCombo[0].suit;
  if (baseCardComboSuit !== comparisonCardComboSuit) {
    return SUITS.indexOf(baseCardComboSuit) > SUITS.indexOf(comparisonCardComboSuit);
  }

  // If suits are the same compare the highest cards
  const highestBaseComboCard = sortCards(baseCardCombo).at(-1)!;
  const highestComparisonComboCard = sortCards(comparisonCardCombo).at(-1)!;

  return getComparisonCardValue(highestBaseComboCard, highestComparisonComboCard) > 0;
}

export function isStraightBigger(
  baseCardCombo: CardCombo,
  comparisonCardCombo: CardCombo,
): boolean {
  const highestBaseComboCard = sortCards(baseCardCombo).at(-1)!;
  const highestComparisonComboCard = sortCards(comparisonCardCombo).at(-1)!;

  return getComparisonCardValue(highestBaseComboCard, highestComparisonComboCard) > 0;
}

export function isFullHouseBigger(
  baseCardCombo: CardCombo,
  comparisonCardCombo: CardCombo,
): boolean {
  const getHighestCardInTriple = (combo: CardCombo) => {
    // We only need to check first 3 cards since full house is already validated
    const firstValue = combo[0].value;
    const filteredCardsByFirstValue = combo.filter((card) => card.value === firstValue);

    // If first value appears 3 times, it's the triple
    if (filteredCardsByFirstValue.length === 3) {
      return sortCards(filteredCardsByFirstValue).at(-1);
    }
    // Otherwise the other value is the triple
    const filteredCardsByNextValue = combo.filter((card) => card.value !== firstValue);
    if (filteredCardsByNextValue.length === 3) {
      return sortCards(filteredCardsByNextValue).at(-1);
    }
  };

  const baseHighestCard = getHighestCardInTriple(baseCardCombo);
  const comparisonHighestCard = getHighestCardInTriple(comparisonCardCombo);

  if (!baseHighestCard || !comparisonHighestCard) {
    throw new Error("Could not detect a triple in the supplied full house combos");
  }
  return getComparisonCardValue(baseHighestCard, comparisonHighestCard) > 0;
}

export function isFourOfAKindBigger(
  baseCardCombo: CardCombo,
  comparisonCardCombo: CardCombo,
): boolean {
  // TODO: this is mostly the same logic as isFullHouseBigger so definitely can be refactored
  const getHighestCardInQuad = (combo: CardCombo) => {
    const firstValue = combo[0].value;
    const filteredCardsByFirstValue = combo.filter((card) => card.value === firstValue);

    // If first value appears 3 times, it's the triple
    if (filteredCardsByFirstValue.length === 4) {
      return sortCards(filteredCardsByFirstValue).at(-1);
    }
    // Otherwise the other value is the triple
    const filteredCardsByNextValue = combo.filter((card) => card.value !== firstValue);
    if (filteredCardsByNextValue.length === 4) {
      return sortCards(filteredCardsByNextValue).at(-1);
    }
  };

  const baseHighestCard = getHighestCardInQuad(baseCardCombo);
  const comparisonHighestCard = getHighestCardInQuad(comparisonCardCombo);

  if (!baseHighestCard || !comparisonHighestCard) {
    throw new Error("Could not detect a triple in the supplied full house combos");
  }
  return getComparisonCardValue(baseHighestCard, comparisonHighestCard) > 0;
}

export function isStraightFlushBigger(
  baseCardCombo: CardCombo,
  comparisonCardCombo: CardCombo,
): boolean {
  const highestBaseComboCard = sortCards(baseCardCombo).at(-1)!;
  const highestComparisonComboCard = sortCards(comparisonCardCombo).at(-1)!;

  return getComparisonCardValue(highestBaseComboCard, highestComparisonComboCard) > 0;
}

/**
 * Use this in conjunction with validateComboType to return a validated card combo object.
 * Once you have a validated card combo object this function can determine which one is bigger.
 *
 * @param baseCardCombo The base card combination to compare.
 * @param comparisonCardCombo The comparison card combination to compare against.
 * @returns boolean
 */
export function isComboBigger(
  baseCardCombo: ValidatedCardCombination,
  comparisonCardCombo: ValidatedCardCombination,
): boolean {
  if (baseCardCombo.type === comparisonCardCombo.type) {
    switch (baseCardCombo.type) {
      case "FLUSH":
        return isFlushBigger(baseCardCombo.cards, comparisonCardCombo.cards);
      case "STRAIGHT":
        return isStraightBigger(baseCardCombo.cards, comparisonCardCombo.cards);
      case "FULL_HOUSE":
        return isFullHouseBigger(baseCardCombo.cards, comparisonCardCombo.cards);
      case "FOUR_OF_A_KIND":
        return isFourOfAKindBigger(baseCardCombo.cards, comparisonCardCombo.cards);
      case "STRAIGHT_FLUSH":
        return isStraightFlushBigger(baseCardCombo.cards, comparisonCardCombo.cards);
    }
  }
  // When combo types are different can evaluate which combo is bigger based on the combo type hierarchy
  const comboTypeOrder: ComboType[] = [
    "FLUSH",
    "STRAIGHT",
    "FULL_HOUSE",
    "FOUR_OF_A_KIND",
    "STRAIGHT_FLUSH",
  ];

  const indexOfBaseCardType = comboTypeOrder.indexOf(baseCardCombo.type);

  const indexOfComparisonCardType = comboTypeOrder.indexOf(comparisonCardCombo.type);

  return indexOfBaseCardType > indexOfComparisonCardType;
}
