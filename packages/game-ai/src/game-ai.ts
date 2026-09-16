import {
  areCardsEqual,
  detectHandType,
  getCardRank,
  isPlayedHandBigger,
  type Card,
  type RoundMode,
} from "@big-two/game-core";

export type MoveRequest = {
  hand: readonly Card[];
  roundMode: RoundMode | null;
  cardsToBeat?: readonly Card[];
  requiredCard?: Card;
};

const modeByPlaySize: Partial<Record<number, RoundMode>> = {
  1: "single",
  2: "pairs",
  5: "combo",
};

function getCombinations(cards: readonly Card[], size: number): Card[][] {
  const combinations: Card[][] = [];
  const combination: Card[] = [];

  function collect(startIndex: number): void {
    if (combination.length === size) {
      combinations.push([...combination]);
      return;
    }

    const cardsNeeded = size - combination.length;
    for (let index = startIndex; index <= cards.length - cardsNeeded; index += 1) {
      combination.push(cards[index]);
      collect(index + 1);
      combination.pop();
    }
  }

  collect(0);
  return combinations;
}

function beats(play: readonly Card[], cardsToBeat: readonly Card[], roundMode: RoundMode): boolean {
  return isPlayedHandBigger({
    playedCards: [...play],
    cardsToBeat: [...cardsToBeat],
    handType: roundMode,
  });
}

function compareCardSets(left: readonly Card[], right: readonly Card[]): number {
  for (let index = 0; index < left.length; index += 1) {
    const difference = getCardRank(left[index]) - getCardRank(right[index]);
    if (difference !== 0) return difference;
  }

  return 0;
}

function comparePlays(left: Card[], right: Card[]): number {
  if (left.length !== right.length) return left.length - right.length;

  const roundMode = modeByPlaySize[left.length];
  if (!roundMode) return compareCardSets(left, right);

  const leftBeatsRight = beats(left, right, roundMode);
  const rightBeatsLeft = beats(right, left, roundMode);

  if (leftBeatsRight !== rightBeatsLeft) return leftBeatsRight ? 1 : -1;
  return compareCardSets(left, right);
}

/**
 * Enumerates all legal plays for a hand, ordered from weakest to strongest.
 * Singles are considered cheaper than pairs, and pairs cheaper than five-card combinations.
 */
export function getLegalPlays({
  hand,
  roundMode,
  cardsToBeat,
  requiredCard,
}: MoveRequest): Card[][] {
  if (roundMode !== null && (!cardsToBeat || detectHandType([...cardsToBeat]) !== roundMode)) {
    return [];
  }

  const sortedHand = hand.toSorted((left, right) => getCardRank(left) - getCardRank(right));
  const playSizes =
    roundMode === null ? [1, 2, 5] : [roundMode === "single" ? 1 : roundMode === "pairs" ? 2 : 5];
  const legalPlays: Card[][] = [];

  for (const playSize of playSizes) {
    const expectedMode = modeByPlaySize[playSize];
    if (!expectedMode) continue;

    for (const play of getCombinations(sortedHand, playSize)) {
      if (detectHandType(play) !== expectedMode) continue;
      if (requiredCard && !play.some((card) => areCardsEqual(card, requiredCard))) continue;
      if (roundMode !== null && !beats(play, cardsToBeat!, roundMode)) continue;
      legalPlays.push(play);
    }
  }

  return legalPlays.toSorted(comparePlays);
}

/** Selects the weakest legal play, or passes when no legal play exists. */
export function chooseBotMove(request: MoveRequest): Card[] | null {
  return getLegalPlays(request)[0] ?? null;
}
