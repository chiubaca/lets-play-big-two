import {
  isComboBigger,
  isPairBigger,
  isPairValid,
  isSingleBigger,
  validateComboType,
  createDeck,
  sortCards,
  type Card,
} from "@big-two/game-core";

import { setup } from "xstate";
import { dealArray, shuffleArray } from "./deck.ts";
import type { GameContext, GameEvent, RoundMode } from "./game-state-machine.types.ts";

export function rotatePlayerIndex(args: { currentPlayerIndex: number; totalPlayers: number }) {
  const { currentPlayerIndex, totalPlayers } = args;
  const incrementedPlayerIndex = currentPlayerIndex + 1;
  const updatedPlayerIndex =
    incrementedPlayerIndex === totalPlayers + 1 ? 0 : incrementedPlayerIndex;

  if (updatedPlayerIndex > totalPlayers) {
    throw new Error(`max index can only be ${totalPlayers}`);
  }

  return updatedPlayerIndex;
}

const mapRoundModeToGuardMessage: Record<RoundMode, string> = {
  combo: "you must play a combo",
  pairs: "you must play pairs",
  single: "you must play a single card",
};

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

export const bigTwoGameMachine = setup({
  types: {
    context: {} as GameContext,
    events: {} as GameEvent,
  },
  actions: {
    addPlayer: ({ context, event }) => {
      if (event.type !== "JOIN_GAME") {
        console.warn("🚨 wrong event type was sent: ", event.type);
        return;
      }
      context.players.push({
        id: event.playerId,
        name: event.playerName,
        hand: [],
      });
    },
    dealCards: ({ context }) => {
      console.log("🎲 Dealing cards...");
      const newDeck = createDeck();
      const shuffledDeck = shuffleArray(newDeck);

      const dealtCards = dealArray(shuffledDeck, context.players.length);

      context.players.forEach((player, index) => {
        context.players[index].hand = sortCards(dealtCards[index]);
      });

      console.log("✅ Cards dealt");
    },
    playFirstMove: ({ context, event }) => {
      if (event.type !== "PLAY_FIRST_MOVE") {
        throw new Error("attempted playFirstMove on incorrect state");
      }
      const cardsPlayed = event.cards;

      // update the current player's hand
      const updatedPlayerHands = updatePlayersHands({
        currentHand: context.players[context.currentPlayerIndex].hand,
        cardsToRemove: cardsPlayed,
      });
      context.players[context.currentPlayerIndex].hand = updatedPlayerHands;

      // update the current player index
      const updatedCurrentPlayerIndex = rotatePlayerIndex({
        currentPlayerIndex: context.currentPlayerIndex,
        totalPlayers: context.players.length - 1,
      });

      const handType = detectHandType(cardsPlayed);
      context.roundMode = handType;
      context.currentPlayerIndex = updatedCurrentPlayerIndex;
      context.cardPile.push(cardsPlayed);
    },
    playCards: ({ context, event }) => {
      if (event.type !== "PLAY_CARDS") {
        console.warn("🚨 attempted playCards action on incorrect state");
        return;
      }
      const cardsPlayed = event.cards;
      const updatedPlayerHands = updatePlayersHands({
        currentHand: context.players[context.currentPlayerIndex].hand,
        cardsToRemove: event.cards,
      });

      // Check for win condition before updating other state
      if (updatedPlayerHands.length === 0) {
        context.winner = { ...context.players[context.currentPlayerIndex] };
      }

      context.players[context.currentPlayerIndex].hand = updatedPlayerHands;
      const updatedPlayerIndex = rotatePlayerIndex({
        currentPlayerIndex: context.currentPlayerIndex,
        totalPlayers: context.players.length - 1,
      });

      context.consecutivePasses = 0;
      context.currentPlayerIndex = updatedPlayerIndex;
      context.cardPile.push(cardsPlayed);
      context.guardMessage = undefined;
    },
    resetGame: ({ context }) => {
      context.players = context.players.map((player) => {
        return {
          hand: [],
          id: player.id,
          name: player.name,
        };
      });

      context.currentPlayerIndex = 0;
      context.roundMode = null;
      context.cardPile = [];
      context.consecutivePasses = 0;
      context.winner = undefined;
      context.guardMessage = undefined;
    },
    passTurn: ({ context, event }) => {
      if (event.type !== "PASS_TURN") {
        console.warn("🚨 attempted passTurn action on incorrect state");
        return;
      }

      const updatedPlayerIndex = rotatePlayerIndex({
        currentPlayerIndex: context.currentPlayerIndex,
        totalPlayers: context.players.length - 1, // start from 0
      });
      context.guardMessage = undefined;
      context.consecutivePasses += 1;
      context.currentPlayerIndex = updatedPlayerIndex;
    },
    playNewRoundFirstMove: ({ context, event }) => {
      if (event.type !== "PLAY_NEW_ROUND_FIRST_MOVE") {
        throw new Error("attempted playFirstMove on incorrect state");
      }

      const cardsPlayed = event.cards;
      const handType = detectHandType(cardsPlayed);

      const updatedPlayerHands = updatePlayersHands({
        currentHand: context.players[context.currentPlayerIndex].hand,
        cardsToRemove: cardsPlayed,
      });
      context.players[context.currentPlayerIndex].hand = updatedPlayerHands;

      // Check for win condition before updating other state
      if (updatedPlayerHands.length === 0) {
        context.winner = { ...context.players[context.currentPlayerIndex] };
      }

      const updatedPlayerIndex = rotatePlayerIndex({
        currentPlayerIndex: context.currentPlayerIndex,
        totalPlayers: context.players.length - 1,
      });

      context.roundMode = handType;
      context.currentPlayerIndex = updatedPlayerIndex;
      context.cardPile.push(cardsPlayed);
    },
    startNewRound: ({ context }) => {
      context.consecutivePasses = 0;
      context.roundMode = null;
    },
  },
  guards: {
    hasMaxPlayers: ({ context }) => context.players.length !== 4,
    hasMinPlayers: ({ context }) => context.players.length > 1,
    isValidFirstMove: ({ event }) => {
      if (event.type !== "PLAY_FIRST_MOVE") {
        console.warn("🚨 attempted PLAY_FIRST_MOVE on incorrect state");
        return false;
      }
      const handType = detectHandType(event.cards);
      if (handType === null) {
        console.warn("🚨 invalid hand was played");
        return false;
      }
      return true;
    },
    isValidNewRoundFirstMove: ({ event }) => {
      if (event.type !== "PLAY_NEW_ROUND_FIRST_MOVE") {
        console.warn("🚨 attempted PLAY_NEW_ROUND_FIRST_MOVE on incorrect state");
        return false;
      }
      const handType = detectHandType(event.cards);
      if (handType === null) {
        console.warn("🚨 invalid hand was played");
        return false;
      }
      return true;
    },
    isPlayedHandValid: ({ context, event }) => {
      if (event.type !== "PLAY_CARDS") {
        console.warn("🚨 attempted PLAY_CARDS on incorrect state");
        return false;
      }
      const handType = detectHandType(event.cards);
      if (handType === null) {
        console.warn("🚨 invalid hand was played");
        context.guardMessage = "invalid hand was played";
        return false;
      }

      if (handType !== context.roundMode) {
        console.warn("🚨 hand type does not match round mode");
        context.guardMessage = context.roundMode
          ? mapRoundModeToGuardMessage[context.roundMode]
          : "Round mode is not set";
        return false;
      }

      const cardsToBeat = context.cardPile.at(-1);
      if (!cardsToBeat) {
        console.warn("🚨 could not get last hand played on cardPile");
        return false;
      }

      if (
        !isPlayedHandBigger({
          playedCards: event.cards,
          cardsToBeat,
          handType: context.roundMode,
        })
      ) {
        console.warn("🚨 played hand is not bigger than last cards on pile");
        context.guardMessage = "Not big enough!";
        return false;
      }

      return true;
    },
    hasEveryonePassedExceptLastPlayer: ({ context }) => {
      const playerCount = context.players.length - 1; //normalise to index 0

      // when all players pass in a row, minus the last player, that player has won the round.
      const numberConsecutivePassesNeededToWinRound = playerCount - 1;
      return context.consecutivePasses >= numberConsecutivePassesNeededToWinRound;
    },
  },
}).createMachine({
  id: "bigTwoGame",
  initial: "WAITING_FOR_PLAYERS",
  context: () => ({
    players: [],
    currentPlayerIndex: 0,
    roundMode: null,
    cardPile: [],
    consecutivePasses: 0,
    winner: undefined,
  }),
  states: {
    WAITING_FOR_PLAYERS: {
      on: {
        JOIN_GAME: {
          actions: ["addPlayer"],
          guard: "hasMaxPlayers",
        },
        START_GAME: {
          actions: ["dealCards"],
          target: "ROUND_FIRST_MOVE",
          guard: "hasMinPlayers",
        },
      },
    },
    ROUND_FIRST_MOVE: {
      always: {
        guard: ({ context }) => context.winner !== undefined,
        target: "GAME_END",
      },
      on: {
        PLAY_FIRST_MOVE: {
          actions: ["playFirstMove"],
          guard: "isValidFirstMove",
          target: "NEXT_PLAYER_TURN",
        },
        RESET_GAME: {
          actions: ["resetGame"],
          target: "WAITING_FOR_PLAYERS",
        },
      },
    },
    NEXT_PLAYER_TURN: {
      always: {
        guard: ({ context }) => context.winner !== undefined,
        target: "GAME_END",
      },
      on: {
        PLAY_CARDS: [
          {
            actions: ["playCards"],
            guard: "isPlayedHandValid",
          },
        ],
        //**
        //* In XState, when you group transitions in an array like this, it creates
        // an ordered list of potential transitions that will be evaluated from top to bottom.
        // this is known as "guard prioritization" or "ordered transitions."
        //*
        PASS_TURN: [
          // check if everyone has passed except the last player
          {
            guard: "hasEveryonePassedExceptLastPlayer",
            target: "PLAY_NEW_ROUND",
            actions: ["passTurn"],
          },
          {
            actions: ["passTurn"],
          },
          // Second transition fallback if first guard fails
        ],
        RESET_GAME: {
          actions: ["resetGame"],
          target: "WAITING_FOR_PLAYERS",
        },
      },
    },
    PLAY_NEW_ROUND: {
      entry: ["startNewRound"],
      on: {
        PLAY_NEW_ROUND_FIRST_MOVE: {
          actions: ["playNewRoundFirstMove"],
          target: "NEXT_PLAYER_TURN",
          guard: "isValidNewRoundFirstMove",
        },
        RESET_GAME: {
          actions: ["resetGame"],
          target: "WAITING_FOR_PLAYERS",
        },
      },
    },
    GAME_END: {
      on: {
        RESET_GAME: {
          actions: ["resetGame"],
          target: "WAITING_FOR_PLAYERS",
        },
      },
    },
  },
});
