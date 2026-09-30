import type { BigTwoGameMachineSnapshot } from "@big-two/game-state-machine";

// Read profiles when projecting a room, so older saved rooms and changed profiles
// use the current emoji without rewriting game state or trusting client input.
export async function withRoomProfileEmojis(
  state: BigTwoGameMachineSnapshot,
  db: D1Database,
): Promise<BigTwoGameMachineSnapshot> {
  const ids = state.context.players.filter((player) => !player.isBot).map((player) => player.id);
  if (ids.length === 0) return state;
  const { results } = await db
    .prepare(`SELECT id, emoji FROM user WHERE id IN (${ids.map(() => "?").join(", ")})`)
    .bind(...ids)
    .all<{ id: string; emoji: string | null }>();
  const emojis = new Map(results.map((profile) => [profile.id, profile.emoji ?? "♠️"]));
  const withEmoji = (player: BigTwoGameMachineSnapshot["context"]["players"][number]) => ({
    ...player,
    emoji: player.isBot ? "🤖" : (emojis.get(player.id) ?? "♠️"),
  });
  return {
    ...state,
    context: {
      ...state.context,
      players: state.context.players.map(withEmoji),
      winner: state.context.winner ? withEmoji(state.context.winner) : undefined,
    },
  };
}
