import {
  chooseBotMove,
  createJevBotMovePlan,
  resolveJevBotMove,
  type JevBotMovePlan,
  type JevMoveRequest,
} from "@big-two/game-ai";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

type JevChoiceQuestion = {
  type: "choice";
  instructions: JsonValue;
  criteria: Record<string, JsonValue>;
};

type JevInput = {
  state: JsonValue;
  questions: Record<string, JevChoiceQuestion>;
};

type JevChoiceAnswer = {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
};

type JevOutput = {
  model: string;
  answers: Record<string, JevChoiceAnswer>;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
};

declare global {
  interface AiModels {
    "typesafe/jev": {
      inputs: JevInput;
      postProcessedOutputs: JevOutput;
    };
  }
}

export type JevBotDecision =
  | { cards: JevMoveRequest["hand"][number][] | null; source: "forced" | "fallback" }
  | {
      cards: JevMoveRequest["hand"][number][] | null;
      source: "jev";
      confidence: number;
      model: string;
    };

export type JevAiBinding = {
  run(model: "typesafe/jev", input: JevInput): Promise<JevOutput>;
};

type JevBotOptions = {
  ai: JevAiBinding;
};

const PLAY_OR_PASS_QUESTION = {
  type: "choice",
  instructions: {
    question: "Should the bot contest this trick now or strategically pass this turn?",
    inspect: [
      "`turn.own_hand` and its remaining pairs and five-card combinations",
      "`turn.current_play_to_beat` and `turn.round_mode`",
      "`turn.played_hands` for cards that cannot still be held by an opponent",
      "`turn.opponent_hand_sizes` for the urgency of stopping an opponent",
      "`turn.candidate_moves` for the actual cost of every legal response",
    ],
    focus:
      "Choose the action with the better path to going out first. Passing is a deliberate tempo play, not a failure to find a legal move.",
  },
  criteria: {
    play: {
      what: "Play a legal response now and use the separate best-play judgment to choose it.",
      prefer_when: [
        "A candidate wins immediately or creates a short, credible route to emptying the hand.",
        "An opponent has one or two cards, so yielding the trick risks letting them go out.",
        "A reasonably cheap response is likely to take control or materially improve the hand shape.",
      ],
      avoid_when:
        "The only useful response wastes a scarce high control card or breaks valuable structure for little chance of retaining control.",
    },
    pass: {
      what: "Pass this turn while preserving the whole hand for a more favorable chance to contest or lead later.",
      prefer_when: [
        "Every worthwhile response spends a 2, ace, high pair, or key five-card-combination card for poor payoff.",
        "The available response is likely to be overcalled and does not improve the route to going out.",
        "Opponents have enough cards that preserving hand structure and control cards is worth yielding tempo.",
      ],
      avoid_when: [
        "A candidate empties the hand now.",
        "An opponent is close to going out and passing leaves a credible finishing route uncontested.",
        "A cheap legal response can seize control without damaging a stronger future play.",
      ],
    },
  },
} satisfies JevChoiceQuestion;

function createBestPlayQuestion(
  plan: JevBotMovePlan,
  isSeparateFromPassDecision: boolean,
): JevChoiceQuestion {
  const criteria = Object.fromEntries(
    Object.entries(plan.criteria).filter(([moveId]) => moveId !== "pass"),
  );

  return {
    type: "choice",
    instructions: {
      ...plan.instructions,
      question: isSeparateFromPassDecision
        ? "Assuming the bot will play rather than pass, which candidate play gives it the strongest route to going out first?"
        : plan.instructions.question,
      constraints: [
        ...plan.instructions.constraints,
        ...(isSeparateFromPassDecision
          ? ["Do not consider passing here; the separate play-or-pass judgment owns that decision."]
          : []),
      ],
      priorities: [
        ...plan.instructions.priorities,
        "Plan beyond this trick: prefer a move that leaves a coherent sequence of pairs, combinations, and control cards rather than stranded weak singles.",
        "Use the played-card history to estimate what can still beat each candidate; do not spend an unbeatable or near-unbeatable card without a concrete payoff.",
        "When several plays shed the same number of cards, compare the hand structures they leave behind instead of automatically choosing the weakest play.",
        "In the endgame, work backward from the fewest likely turns needed to empty the hand and deny opponents with one or two cards an easy finish.",
      ],
    },
    criteria,
  };
}

function requireChoiceAnswer(response: JevOutput, questionId: string): JevChoiceAnswer {
  const answer = response.answers[questionId];
  if (!answer) throw new Error(`Jev did not answer ${questionId}`);
  return answer;
}

export async function chooseJevBotMove(
  request: JevMoveRequest,
  options: JevBotOptions,
): Promise<JevBotDecision> {
  const plan = createJevBotMovePlan(request);
  const moveIds = Object.keys(plan.moves);

  if (moveIds.length <= 1) {
    const forcedMove = moveIds[0] ? resolveJevBotMove(plan, moveIds[0]) : plan.fallback;
    return { cards: forcedMove ?? null, source: "forced" };
  }

  const canPass = Object.hasOwn(plan.moves, "pass");
  const moveQuestionId = canPass ? "best_play" : "best_move";
  const moveQuestion = createBestPlayQuestion(plan, canPass);
  const questions: Record<string, JevChoiceQuestion> = {
    [moveQuestionId]: moveQuestion,
    ...(canPass ? { play_or_pass: PLAY_OR_PASS_QUESTION } : {}),
  };

  const response = await options.ai.run("typesafe/jev", {
    state: plan.state,
    questions,
  });

  if (canPass) {
    const playOrPassAnswer = requireChoiceAnswer(response, "play_or_pass");
    if (playOrPassAnswer.choice === "pass") {
      return {
        cards: null,
        source: "jev",
        confidence: playOrPassAnswer.confidence,
        model: response.model,
      };
    }
    if (playOrPassAnswer.choice !== "play") {
      throw new Error(`Jev selected an unknown play-or-pass strategy: ${playOrPassAnswer.choice}`);
    }
  }

  const answer = requireChoiceAnswer(response, moveQuestionId);
  if (!Object.hasOwn(moveQuestion.criteria, answer.choice)) {
    throw new Error(`Jev selected an unknown move: ${answer.choice}`);
  }

  const cards = resolveJevBotMove(plan, answer.choice);
  if (cards === undefined) throw new Error(`Jev selected an unknown move: ${answer.choice}`);

  const playOrPassConfidence = canPass
    ? requireChoiceAnswer(response, "play_or_pass").confidence
    : answer.confidence;

  return {
    cards,
    source: "jev",
    confidence: Math.min(answer.confidence, playOrPassConfidence),
    model: response.model,
  };
}

export async function chooseJevBotMoveWithFallback(
  request: JevMoveRequest,
  options: JevBotOptions,
): Promise<JevBotDecision> {
  try {
    return await chooseJevBotMove(request, options);
  } catch {
    return {
      cards: chooseBotMove({
        hand: request.hand,
        roundMode: request.roundMode,
        cardsToBeat: request.roundMode === null ? undefined : request.playedHands.at(-1),
        requiredCard: request.requiredCard,
      }),
      source: "fallback",
    };
  }
}
