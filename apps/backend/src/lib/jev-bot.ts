import {
  chooseBotMove,
  createJevBotMovePlan,
  resolveJevBotMove,
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

  const response = await options.ai.run("typesafe/jev", {
    state: plan.state,
    questions: {
      best_move: {
        type: "choice",
        instructions: plan.instructions,
        criteria: plan.criteria,
      },
    },
  });
  const answer = response.answers.best_move;
  const cards = resolveJevBotMove(plan, answer.choice);

  if (cards === undefined) {
    throw new Error(`Jev selected an unknown move: ${answer.choice}`);
  }

  return {
    cards,
    source: "jev",
    confidence: answer.confidence,
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
