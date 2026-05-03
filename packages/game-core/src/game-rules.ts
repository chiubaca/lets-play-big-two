import {
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
  return currentHand.filter(
    (card) => !cardsToRemove.some((c) => c.suit === card.suit && c.value === card.value),
  );
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
