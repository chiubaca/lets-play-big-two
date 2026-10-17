import { getLegalPlays, type JevMoveRequest } from "@big-two/game-ai";
import { cardSchema, type BigTwoGameMachineSnapshot, type Card } from "@big-two/game-state-machine";
import type { createRequest } from "../network/request";
import { isGameTurnState } from "./game-helpers";

export type JevBotMoveDecision = { cards: Card[] | null; source: "jev" | "fallback" | "forced" };
export type JevBotMoveRequester = (
  request: JevMoveRequest,
  signal: AbortSignal,
) => Promise<JevBotMoveDecision>;

/** Only the acting hand and public information leave the private local game. */
export function getJevMoveRequest(
  snapshot: BigTwoGameMachineSnapshot,
  playerId: string,
): JevMoveRequest {
  const player = snapshot.context.players[snapshot.context.currentPlayerIndex];
  if (!isGameTurnState(snapshot.value) || player?.id !== playerId)
    throw new Error("Cannot request a Jev move outside the player's turn");
  return {
    hand: player.hand,
    playedHands: snapshot.context.cardPile,
    roundMode: snapshot.value === "NEXT_PLAYER_TURN" ? snapshot.context.roundMode : null,
    requiredCard:
      snapshot.value === "ROUND_FIRST_MOVE" ? { suit: "DIAMOND", value: "3" } : undefined,
    opponentHandSizes: snapshot.context.players
      .filter((entry) => entry.id !== playerId)
      .map((entry) => entry.hand.length),
  };
}

const cardsSchema = cardSchema.array().min(1).max(5).nullable();
const cardKey = (cards: Card[]) =>
  cards
    .map((card) => `${card.value}:${card.suit}`)
    .sort()
    .join(",");

export function createJevBotClient(
  sendRequest: ReturnType<typeof createRequest>,
): JevBotMoveRequester {
  return async (request, signal) => {
    const response = await sendRequest<unknown>("/api/bot/jev/move", {
      method: "POST",
      json: request,
      signal,
    });
    if (!response || typeof response !== "object" || !("cards" in response))
      throw new Error("Invalid Jev move response");
    if (
      !("source" in response) ||
      (response.source !== "jev" && response.source !== "fallback" && response.source !== "forced")
    )
      throw new Error("Invalid Jev decision source");
    const source = response.source;
    const cards = cardsSchema.parse(response.cards);
    if (cards === null) {
      if (request.roundMode === null) throw new Error("Jev cannot pass when leading");
      return { cards: null, source };
    }
    const selectedCards = cardKey(cards);
    const legal = getLegalPlays({
      hand: request.hand,
      roundMode: request.roundMode,
      cardsToBeat: request.roundMode === null ? undefined : request.playedHands.at(-1),
      requiredCard: request.requiredCard,
    }).find((play) => cardKey(play) === selectedCards);
    if (!legal) throw new Error("Jev returned an illegal move");
    return { cards: legal.map((card) => ({ ...card })), source };
  };
}
