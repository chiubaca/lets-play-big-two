import {
  areCardsEqual,
  createDeck,
  detectHandType,
  doesHandContainCards,
  isPlayedHandBigger,
  sortCards,
  updatePlayersHands,
  type Card,
  type RoundMode,
} from "@big-two/game-core";
import { assign, setup } from "xstate";
import { dealArray, shuffleArray } from "./deck.ts";
import type { GameContext, GameEvent, Player } from "./game-state-machine.types.ts";

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

const guardMessages = {
  cardsNotInHand: "Played cards are not in your hand",
  firstMoveNeedsThreeOfDiamonds: "First move must include 3 of DIAMOND",
  invalidEvent: "Invalid game event",
  invalidHand: "invalid hand was played",
  missingCardsToBeat: "Could not find the last played hand",
  notBigEnough: "Not big enough!",
  notYourTurn: "It is not your turn",
  roundModeNotSet: "Round mode is not set",
} as const;

const threeOfDiamonds: Card = { suit: "DIAMOND", value: "3" };

type TurnEvent = Extract<
  GameEvent,
  {
    type: "PLAY_FIRST_MOVE" | "PLAY_NEW_ROUND_FIRST_MOVE" | "PLAY_CARDS" | "PASS_TURN";
  }
>;
type PlayEvent = Extract<TurnEvent, { cards: Card[] }>;

function getCurrentPlayer(context: GameContext): Player | undefined {
  return context.players[context.currentPlayerIndex];
}

function getTurnValidationMessage(context: GameContext, event: TurnEvent): string | undefined {
  const currentPlayer = getCurrentPlayer(context);
  if (!currentPlayer || currentPlayer.id !== event.playerId) {
    return guardMessages.notYourTurn;
  }
}

function getLeadPlayValidationMessage(
  context: GameContext,
  event: PlayEvent,
  requiresThreeOfDiamonds: boolean,
): string | undefined {
  const turnMessage = getTurnValidationMessage(context, event);
  if (turnMessage) return turnMessage;

  const currentPlayer = getCurrentPlayer(context)!;
  if (!doesHandContainCards({ hand: currentPlayer.hand, cards: event.cards })) {
    return guardMessages.cardsNotInHand;
  }

  if (
    requiresThreeOfDiamonds &&
    !event.cards.some((card) => areCardsEqual(card, threeOfDiamonds))
  ) {
    return guardMessages.firstMoveNeedsThreeOfDiamonds;
  }

  if (detectHandType(event.cards) === null) {
    return guardMessages.invalidHand;
  }
}

function getFollowPlayValidationMessage(
  context: GameContext,
  event: PlayEvent,
): string | undefined {
  const turnMessage = getTurnValidationMessage(context, event);
  if (turnMessage) return turnMessage;

  const currentPlayer = getCurrentPlayer(context)!;
  if (!doesHandContainCards({ hand: currentPlayer.hand, cards: event.cards })) {
    return guardMessages.cardsNotInHand;
  }

  const handType = detectHandType(event.cards);
  if (handType === null) return guardMessages.invalidHand;

  if (handType !== context.roundMode) {
    return context.roundMode
      ? mapRoundModeToGuardMessage[context.roundMode]
      : guardMessages.roundModeNotSet;
  }

  const cardsToBeat = context.cardPile.at(-1);
  if (!cardsToBeat) return guardMessages.missingCardsToBeat;

  if (
    !isPlayedHandBigger({
      playedCards: event.cards,
      cardsToBeat,
      handType,
    })
  ) {
    return guardMessages.notBigEnough;
  }
}

function getCardPlayUpdates(
  context: GameContext,
  cards: Card[],
  startsRound: boolean,
): Partial<GameContext> {
  const playerIndex = context.currentPlayerIndex;
  const currentPlayer = context.players[playerIndex];
  const updatedHand = updatePlayersHands({
    currentHand: currentPlayer.hand,
    cardsToRemove: cards,
  });
  const updatedPlayer = { ...currentPlayer, hand: updatedHand };
  const players = context.players.map((player, index) =>
    index === playerIndex ? updatedPlayer : player,
  );

  return {
    players,
    currentPlayerIndex: rotatePlayerIndex({
      currentPlayerIndex: playerIndex,
      totalPlayers: players.length - 1,
    }),
    roundMode: startsRound ? detectHandType(cards) : context.roundMode,
    cardPile: [...context.cardPile, cards.map((card) => ({ ...card }))],
    consecutivePasses: 0,
    winner: updatedHand.length === 0 ? updatedPlayer : context.winner,
    guardMessage: undefined,
  };
}

export const bigTwoGameMachine = setup({
  types: {
    context: {} as GameContext,
    events: {} as GameEvent,
  },
  actions: {
    addPlayer: assign(({ context, event }) => {
      if (event.type !== "JOIN_GAME") return {};

      return {
        players: [
          ...context.players,
          {
            id: event.playerId,
            name: event.playerName,
            hand: [],
          },
        ],
      };
    }),
    dealCards: assign(({ context }) => {
      const dealtCards = dealArray(shuffleArray(createDeck()), context.players.length);
      const players = context.players.map((player, index) => ({
        ...player,
        hand: sortCards(dealtCards[index]),
      }));
      const currentPlayerIndex = players.findIndex((player) =>
        player.hand.some((card) => areCardsEqual(card, threeOfDiamonds)),
      );

      if (currentPlayerIndex === -1) {
        throw new Error("Dealt deck does not contain 3 of DIAMOND");
      }

      return {
        players,
        currentPlayerIndex,
        guardMessage: undefined,
      };
    }),
    playFirstMove: assign(({ context, event }) => {
      if (event.type !== "PLAY_FIRST_MOVE") return {};
      return getCardPlayUpdates(context, event.cards, true);
    }),
    playCards: assign(({ context, event }) => {
      if (event.type !== "PLAY_CARDS") return {};
      return getCardPlayUpdates(context, event.cards, false);
    }),
    resetGame: assign(({ context }) => ({
      players: context.players.map((player) => ({
        hand: [],
        id: player.id,
        name: player.name,
      })),
      currentPlayerIndex: 0,
      roundMode: null,
      cardPile: [],
      consecutivePasses: 0,
      winner: undefined,
      guardMessage: undefined,
    })),
    passTurn: assign(({ context }) => ({
      currentPlayerIndex: rotatePlayerIndex({
        currentPlayerIndex: context.currentPlayerIndex,
        totalPlayers: context.players.length - 1,
      }),
      consecutivePasses: context.consecutivePasses + 1,
      guardMessage: undefined,
    })),
    playNewRoundFirstMove: assign(({ context, event }) => {
      if (event.type !== "PLAY_NEW_ROUND_FIRST_MOVE") return {};
      return getCardPlayUpdates(context, event.cards, true);
    }),
    startNewRound: assign({
      consecutivePasses: 0,
      roundMode: null,
      guardMessage: undefined,
    }),
    setInvalidFirstMoveMessage: assign({
      guardMessage: ({ context, event }) =>
        event.type === "PLAY_FIRST_MOVE"
          ? getLeadPlayValidationMessage(context, event, true)
          : guardMessages.invalidEvent,
    }),
    setInvalidFollowPlayMessage: assign({
      guardMessage: ({ context, event }) =>
        event.type === "PLAY_CARDS"
          ? getFollowPlayValidationMessage(context, event)
          : guardMessages.invalidEvent,
    }),
    setInvalidNewRoundFirstMoveMessage: assign({
      guardMessage: ({ context, event }) =>
        event.type === "PLAY_NEW_ROUND_FIRST_MOVE"
          ? getLeadPlayValidationMessage(context, event, false)
          : guardMessages.invalidEvent,
    }),
    setInvalidTurnMessage: assign({
      guardMessage: guardMessages.notYourTurn,
    }),
  },
  guards: {
    hasMinPlayers: ({ context }) => context.players.length > 1,
    canJoinGame: ({ context, event }) => {
      if (event.type !== "JOIN_GAME") return false;
      const isAlreadyInGame = context.players.some((player) => player.id === event.playerId);
      return !isAlreadyInGame && context.players.length < 4;
    },
    isValidFirstMove: ({ context, event }) =>
      event.type === "PLAY_FIRST_MOVE" &&
      getLeadPlayValidationMessage(context, event, true) === undefined,
    isValidNewRoundFirstMove: ({ context, event }) =>
      event.type === "PLAY_NEW_ROUND_FIRST_MOVE" &&
      getLeadPlayValidationMessage(context, event, false) === undefined,
    isPlayedHandValid: ({ context, event }) =>
      event.type === "PLAY_CARDS" && getFollowPlayValidationMessage(context, event) === undefined,
    isCurrentPlayersTurn: ({ context, event }) =>
      event.type === "PASS_TURN" && getTurnValidationMessage(context, event) === undefined,
    validPassStartsNewRound: ({ context, event }) =>
      event.type === "PASS_TURN" &&
      getTurnValidationMessage(context, event) === undefined &&
      context.consecutivePasses + 1 >= context.players.length - 1,
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
          actions: "addPlayer",
          guard: "canJoinGame",
        },
        START_GAME: {
          actions: "dealCards",
          target: "ROUND_FIRST_MOVE",
          guard: "hasMinPlayers",
        },
        RESET_GAME: {
          actions: "resetGame",
        },
      },
    },
    ROUND_FIRST_MOVE: {
      always: {
        guard: ({ context }) => context.winner !== undefined,
        target: "GAME_END",
      },
      on: {
        PLAY_FIRST_MOVE: [
          {
            actions: "playFirstMove",
            guard: "isValidFirstMove",
            target: "NEXT_PLAYER_TURN",
          },
          { actions: "setInvalidFirstMoveMessage" },
        ],
        RESET_GAME: {
          actions: "resetGame",
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
            actions: "playCards",
            guard: "isPlayedHandValid",
          },
          { actions: "setInvalidFollowPlayMessage" },
        ],
        PASS_TURN: [
          {
            guard: "validPassStartsNewRound",
            target: "PLAY_NEW_ROUND",
            actions: "passTurn",
          },
          {
            guard: "isCurrentPlayersTurn",
            actions: "passTurn",
          },
          { actions: "setInvalidTurnMessage" },
        ],
        RESET_GAME: {
          actions: "resetGame",
          target: "WAITING_FOR_PLAYERS",
        },
      },
    },
    PLAY_NEW_ROUND: {
      entry: "startNewRound",
      always: {
        guard: ({ context }) => context.winner !== undefined,
        target: "GAME_END",
      },
      on: {
        PLAY_NEW_ROUND_FIRST_MOVE: [
          {
            actions: "playNewRoundFirstMove",
            target: "NEXT_PLAYER_TURN",
            guard: "isValidNewRoundFirstMove",
          },
          { actions: "setInvalidNewRoundFirstMoveMessage" },
        ],
        RESET_GAME: {
          actions: "resetGame",
          target: "WAITING_FOR_PLAYERS",
        },
      },
    },
    GAME_END: {
      on: {
        RESET_GAME: {
          actions: "resetGame",
          target: "WAITING_FOR_PLAYERS",
        },
      },
    },
  },
});
