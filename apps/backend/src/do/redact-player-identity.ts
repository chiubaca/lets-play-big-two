import type { BigTwoGameMachineSnapshot, Player } from "@big-two/game-state-machine";

export function redactPlayerIdentity(
  gameState: BigTwoGameMachineSnapshot,
  playerId: string,
  deletedPlayerId: string,
): BigTwoGameMachineSnapshot | null {
  let identityFound = false;
  const redact = (player: Player): Player => {
    if (player.id !== playerId) return player;

    identityFound = true;
    return { ...player, id: deletedPlayerId, name: "Deleted player" };
  };
  const players = gameState.context.players.map(redact);
  const winner = gameState.context.winner ? redact(gameState.context.winner) : undefined;

  if (!identityFound) return null;

  return {
    ...gameState,
    context: {
      ...gameState.context,
      players,
      winner,
    },
  };
}
