import type { BigTwoGameMachineSnapshot, RoomGameState } from "@big-two/game-state-machine";

export function roomView(
  state: BigTwoGameMachineSnapshot,
  viewerId: string,
  spectatorCount: number,
): RoomGameState {
  return {
    ...state,
    context: {
      ...state.context,
      guardMessage: undefined,
      players: state.context.players.map((player) => ({
        ...player,
        hand: player.id === viewerId ? player.hand : [],
      })),
      winner: state.context.winner
        ? {
            ...state.context.winner,
            hand: state.context.winner.id === viewerId ? state.context.winner.hand : [],
          }
        : undefined,
    },
    handCounts: Object.fromEntries(
      state.context.players.map((player) => [player.id, player.hand.length]),
    ),
    spectatorCount,
  };
}
