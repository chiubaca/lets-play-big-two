import type { Player } from "@big-two/game-state-machine";

/** Keep empty slots, and show all four public seats when the visitor spectates. */
export function tableSeats(players: Player[], viewerId: string) {
  const start = Math.max(
    0,
    players.findIndex((player) => player.id === viewerId),
  );
  const at = (offset: number) => players[(start + offset) % 4];
  return { bottom: at(0), left: at(1), top: at(2), right: at(3) };
}
