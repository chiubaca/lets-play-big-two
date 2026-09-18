import {
  chooseBotMove,
  createJevBotMovePlan,
  resolveJevBotMove,
  type JevMoveRequest,
} from "@big-two/game-ai";
import { choice, TypeSafeClient, type Fetch } from "@typesafe-ai/sdk";

export type JevBotDecision =
  | { cards: JevMoveRequest["hand"][number][] | null; source: "forced" | "fallback" }
  | {
      cards: JevMoveRequest["hand"][number][] | null;
      source: "jev";
      confidence: number;
      model: string;
    };

type JevBotOptions = {
  apiKey?: string;
  fetch?: Fetch;
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

  const client = new TypeSafeClient({
    apiKey: options.apiKey,
    ...(options.fetch ? { fetch: options.fetch } : {}),
    timeout: 4_000,
    retry: {
      maxRetries: 1,
      maxRetryAfterMs: 1_000,
    },
  });
  const response = await client.systemOne({
    model: "jev-latest",
    state: plan.state,
    questions: {
      best_move: choice(plan.instructions, plan.criteria),
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
