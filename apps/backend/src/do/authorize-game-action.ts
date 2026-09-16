import type { GameEvent, Player } from "@big-two/game-state-machine";

export function getGameActionAuthorizationError({
  event,
  players,
  requesterId,
}: {
  event: GameEvent;
  players: Player[];
  requesterId: string;
}): string | undefined {
  if (event.type === "JOIN_GAME") {
    return event.playerId === requesterId ? undefined : "Cannot join as another player";
  }

  if (!players.some((player) => player.id === requesterId)) {
    return "You are not a participant in this room";
  }

  if ("playerId" in event && event.playerId !== requesterId) {
    return "Cannot act as another player";
  }

  if (
    (event.type === "START_GAME" || event.type === "RESET_GAME") &&
    players[0]?.id !== requesterId
  ) {
    return "Only the room creator can manage the game";
  }
}
