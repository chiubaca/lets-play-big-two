import {
  areCardsEqual,
  detectHandType,
  getCardRank,
  isPlayedHandBigger,
  validateComboType,
  type Card,
  type RoundMode,
} from "@big-two/game-core";

export type MoveRequest = {
  hand: readonly Card[];
  roundMode: RoundMode | null;
  cardsToBeat?: readonly Card[];
  requiredCard?: Card;
};

export type JevMoveRequest = Omit<MoveRequest, "cardsToBeat"> & {
  playedHands: readonly (readonly Card[])[];
  opponentHandSizes?: readonly number[];
};

type JevCandidateMove = {
  id: string;
  cards: string[];
  category: string;
  cards_left_after_play: number;
};

export type JevBotMovePlan = {
  state: {
    game: {
      name: "Big Two";
      goal: string;
      card_order_low_to_high: string;
      suit_order_low_to_high: string;
    };
    turn: {
      own_hand: string[];
      played_hands: string[][];
      current_play_to_beat: string[] | null;
      round_mode: RoundMode | "lead";
      opponent_hand_sizes: number[];
      candidate_moves: JevCandidateMove[];
    };
  };
  instructions: {
    question: string;
    constraints: string[];
    priorities: string[];
  };
  criteria: Record<string, string>;
  moves: Record<string, Card[] | null>;
  fallback: Card[] | null;
};

const MAX_JEV_MOVE_CANDIDATES = 80;

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

function formatCard(card: Card): string {
  return `${card.value} of ${card.suit.toLowerCase()}s`;
}

function getMoveCategory(play: readonly Card[]): string {
  if (play.length === 1) return "single";
  if (play.length === 2) return "pair";

  const combo = validateComboType([...play]);
  return combo?.type.toLowerCase().replaceAll("_", " ") ?? "five-card combination";
}

function sampleEvenly<T>(items: readonly T[], count: number): T[] {
  if (count >= items.length) return [...items];
  if (count <= 0) return [];
  if (count === 1) return [items[0]];

  return Array.from({ length: count }, (_, index) => {
    const itemIndex = Math.round((index * (items.length - 1)) / (count - 1));
    return items[itemIndex];
  });
}

function selectJevMoveCandidates(legalPlays: Card[][]): Card[][] {
  if (legalPlays.length <= MAX_JEV_MOVE_CANDIDATES) return legalPlays;

  const groups = new Map<string, Card[][]>();
  for (const play of legalPlays) {
    const category = getMoveCategory(play);
    groups.set(category, [...(groups.get(category) ?? []), play]);
  }

  const selected = new Set<Card[]>();
  const candidatesPerGroup = Math.max(1, Math.floor(MAX_JEV_MOVE_CANDIDATES / groups.size));
  for (const plays of groups.values()) {
    for (const play of sampleEvenly(plays, Math.min(candidatesPerGroup, plays.length))) {
      selected.add(play);
    }
  }

  const remainingCapacity = MAX_JEV_MOVE_CANDIDATES - selected.size;
  const remainingPlays = legalPlays.filter((play) => !selected.has(play));
  for (const play of sampleEvenly(remainingPlays, remainingCapacity)) selected.add(play);

  return legalPlays.filter((play) => selected.has(play));
}

/**
 * Builds a bounded Choice question for Jev from deterministic, legal Big Two moves.
 * Jev selects an id; code retains ownership of the cards and game rules.
 */
export function createJevBotMovePlan(request: JevMoveRequest): JevBotMovePlan {
  const cardsToBeat = request.roundMode === null ? undefined : request.playedHands.at(-1);
  const legalPlays = getLegalPlays({
    hand: request.hand,
    roundMode: request.roundMode,
    cardsToBeat,
    requiredCard: request.requiredCard,
  });
  const candidates = selectJevMoveCandidates(legalPlays);
  const moves: Record<string, Card[] | null> = {};
  const criteria: Record<string, string> = {};
  const candidateMoves: JevCandidateMove[] = [];

  candidates.forEach((play, index) => {
    const id = `play_${index + 1}`;
    const cards = play.map(formatCard);
    const category = getMoveCategory(play);
    const cardsLeft = request.hand.length - play.length;
    moves[id] = play;
    criteria[id] =
      `Play ${cards.join(", ")} as a ${category}; this sheds ${play.length} card${play.length === 1 ? "" : "s"} and leaves ${cardsLeft} cards in hand.`;
    candidateMoves.push({
      id,
      cards,
      category,
      cards_left_after_play: cardsLeft,
    });
  });

  if (request.roundMode !== null) {
    moves.pass = null;
    criteria.pass =
      "Pass this turn, keeping every card for a later trick. Use this when spending a legal play now would damage the hand more than yielding control.";
    candidateMoves.push({
      id: "pass",
      cards: [],
      category: "pass",
      cards_left_after_play: request.hand.length,
    });
  }

  return {
    state: {
      game: {
        name: "Big Two",
        goal: "Be the first player to empty your hand.",
        card_order_low_to_high: "3, 4, 5, 6, 7, 8, 9, 10, J, Q, K, A, 2",
        suit_order_low_to_high: "diamonds, clubs, hearts, spades",
      },
      turn: {
        own_hand: request.hand.map(formatCard),
        played_hands: request.playedHands.map((hand) => hand.map(formatCard)),
        current_play_to_beat: cardsToBeat?.map(formatCard) ?? null,
        round_mode: request.roundMode ?? "lead",
        opponent_hand_sizes: [...(request.opponentHandSizes ?? [])],
        candidate_moves: candidateMoves,
      },
    },
    instructions: {
      question: "Which candidate move is the best strategic next action in this Big Two turn?",
      constraints: [
        "Choose exactly one id from `turn.candidate_moves`.",
        "Every listed play is legal; do not invent cards or another action.",
        "Passing is possible only when the pass candidate is listed.",
      ],
      priorities: [
        "Maximize the chance of emptying `turn.own_hand` before every opponent.",
        "Use `turn.played_hands` to judge which strong cards and combinations are still likely unseen.",
        "Shed multiple cards when useful without needlessly breaking valuable pairs or five-card combinations.",
        "Use enough strength to gain or keep control, but preserve scarce high cards when a cheaper move is strategically sound.",
        "Play more urgently when an opponent has very few cards remaining.",
      ],
    },
    criteria,
    moves,
    fallback: legalPlays[0] ?? null,
  };
}

/** Resolves Jev's closed-set answer back to cards. Undefined means the answer was not offered. */
export function resolveJevBotMove(
  plan: JevBotMovePlan,
  selectedMove: string,
): Card[] | null | undefined {
  if (!Object.hasOwn(plan.moves, selectedMove)) return undefined;
  const cards = plan.moves[selectedMove];
  return cards?.map((card) => ({ ...card })) ?? null;
}
