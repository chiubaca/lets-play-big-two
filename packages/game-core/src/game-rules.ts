import {
  getCardKey,
  isSingleBigger,
  isPairBigger,
  isPairValid,
  type Card,
  type RoundMode,
} from "./card-utils.ts";
import { isComboBigger, validateComboType } from "./combo-validators.ts";

export function updatePlayersHands({
  currentHand,
  cardsToRemove,
}: {
  currentHand: Card[];
  cardsToRemove: Card[];
}): Card[] {
  const removals = countCards(cardsToRemove);

  return currentHand.filter((card) => {
    const key = getCardKey(card);
    const remainingRemovals = removals.get(key) ?? 0;
    if (remainingRemovals === 0) return true;

    removals.set(key, remainingRemovals - 1);
    return false;
  });
}

export function doesHandContainCards({ hand, cards }: { hand: Card[]; cards: Card[] }): boolean {
  if (cards.length > hand.length) return false;

  const availableCards = countCards(hand);
  return cards.every((card) => {
    const key = getCardKey(card);
    const availableCount = availableCards.get(key) ?? 0;
    if (availableCount === 0) return false;

    availableCards.set(key, availableCount - 1);
    return true;
  });
}

function countCards(cards: Card[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const card of cards) {
    const key = getCardKey(card);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function detectHandType(cards: Card[]): RoundMode | null {
  if (cards.length === 1) return "single";

  if (cards.length === 2 && isPairValid([cards[0], cards[1]])) return "pairs";

  if (cards.length === 5 && validateComboType(cards)) {
    return "combo";
  }

  return null;
}

export function isPlayedHandBigger(args: {
  playedCards: Card[];
  cardsToBeat: Card[];
  handType: RoundMode;
}): boolean {
  const { handType, playedCards, cardsToBeat } = args;

  if (handType === "single") {
    return isSingleBigger(playedCards[0], cardsToBeat[0]);
  }

  if (handType === "pairs") {
    return isPairBigger([playedCards[0], playedCards[1]], [cardsToBeat[0], cardsToBeat[1]]);
  }

  if (handType === "combo") {
    const validatedPlayedCombo = validateComboType(playedCards);
    const validatedComboToBeat = validateComboType(cardsToBeat);

    if (!validatedPlayedCombo || !validatedComboToBeat) {
      console.warn("combo was not validated correctly");
      return false;
    }

    return isComboBigger(validatedPlayedCombo, validatedComboToBeat);
  }

  return false;
}
