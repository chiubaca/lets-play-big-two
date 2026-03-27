export const SUITS = ["DIAMOND", "CLUB", "HEART", "SPADE"] as const;
export const CARD_VALUES = [
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
  "2",
] as const;

export type Card = {
  suit: (typeof SUITS)[number];
  value: (typeof CARD_VALUES)[number];
};

export type Pairs = [Card, Card];

/**
 * Creates a standard deck of 52 playing cards for the Big Two game.
 *
 * This function generates a complete deck by combining each suit with each value.
 * The deck is created in a specific order:
 * - Suits: DIAMOND, CLUB, HEART, SPADE
 * - Values: 3, 4, 5, 6, 7, 8, 9, 10, J, Q, K, A, 2
 *
 * @returns An array of 52 `Card` objects, each representing a unique card in the deck.
 */
export function createDeck(): Card[] {
  return SUITS.flatMap((suit) => CARD_VALUES.map((value) => ({ suit, value })));
}

/**
 * Returns the rank of a specific card, 1 being the lowest (3 of Diamond) and
 * 52 being the highest (2 of Spades).
 * @param card A Card to get the rank for
 * @returns A number representing the rank of the card
 */
export function getCardRank(card: Card): number {
  const suitIndex = SUITS.indexOf(card.suit) + 1;
  const valueStep = CARD_VALUES.indexOf(card.value) * 4;
  return valueStep + suitIndex;
}

/**
 * Compares the rank and suit of two cards and returns a numeric value representing their relative order.
 *
 * The returned value is:
 * - Positive if `baseCard` is greater than `comparisonCard`
 * - Negative if `baseCard` is less than `comparisonCard`
 * - Zero if the cards have the same rank and suit
 *
 * The comparison first looks at the value of the cards, and if the values are the same, it compares the suits.
 *
 * @param baseCard The card to compare against.
 * @param comparisonCard The card to compare to the `baseCard`.
 * @returns A number representing the relative order of the two cards.
 */
export function getComparisonCardValue(baseCard: Card, comparisonCard: Card): number {
  return getCardRank(baseCard) - getCardRank(comparisonCard);
}

/**
 * Sorts an array of `Card` objects in ascending order based on their rank.
 *
 * The rank of a card is determined by the `getCardRank` function, which takes into account both the card's value and suit.
 *
 * @param cards An array of `Card` objects to be sorted.
 * @returns A new array of `Card` objects sorted in ascending order.
 */
export function sortCards(cards: Card[]): Card[] {
  return cards.sort((a, b) => getCardRank(a) - getCardRank(b));
}

/**
 * Compares two cards and determines if the base card is bigger than the comparison card.
 *
 * @param baseCard The card to compare against.
 * @param comparisonCard The card to compare to the `baseCard`.
 * @returns A boolean value: true if `baseCard` is bigger, false otherwise.
 */
export function isSingleBigger(baseCard: Card, comparisonCard: Card): boolean {
  return getComparisonCardValue(baseCard, comparisonCard) > 0;
}

/**
 * Checks if a pair of cards is valid.
 * A pair is considered valid if the two cards have the same value.
 *
 * @param pairs The pair of cards to validate.
 * @returns boolean
 */
export function isPairValid(pairs: Pairs): boolean {
  return pairs[0].value === pairs[1].value;
}

/**
 * Compares two pairs of cards and determines if the base pair is bigger than the comparison pair.
 * Note: this does not validate if the cards are a valid pair. Use isPairValid to validate.
 *
 * @param basePair The pair of cards to compare against.
 * @param comparisonPair The pair of cards to compare to the `basePair`.
 * @returns A boolean value: true if `basePair` is bigger, false otherwise.
 */
export function isPairBigger(basePair: Pairs, comparisonPair: Pairs): boolean {
  const highestCardInBasePair = sortCards(basePair)[1];
  const highestCardInComparisonPair = sortCards(comparisonPair)[1];
  return isSingleBigger(highestCardInBasePair, highestCardInComparisonPair);
}

/**
 * Returns the sequence value of a card, where the lowest card (3) has a value of 1 and the highest card (2) has a value of 13.
 *
 * @param card The card to get the sequence value for.
 * @returns number
 */
export function getSequenceValue(card: Card): number {
  return CARD_VALUES.indexOf(card.value) + 1;
}
