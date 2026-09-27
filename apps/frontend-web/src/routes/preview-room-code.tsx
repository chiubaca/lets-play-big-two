import { createFileRoute } from "@tanstack/react-router";
import type { RoomGameState } from "@big-two/game-state-machine";
import { GameRoom } from "~/components/game-room";

export const Route = createFileRoute("/preview-room-code")({
  component: Preview,
});

// Temporary visual preview for the room-code pill. Delete before merging.
function Preview() {
  const gameState = {
    value: "WAITING_FOR_PLAYERS",
    context: {
      cardPile: [],
      currentPlayerIndex: 0,
      guardMessage: undefined,
      players: [
        { id: "you", name: "You", hand: [] },
        { id: "ada", name: "Ada", hand: [] },
      ],
      winner: undefined,
    },
    spectatorCount: 2,
  } as unknown as RoomGameState;
  return (
    <GameRoom
      gameState={gameState}
      send={() => {}}
      tableLabel="ABCDE"
      roomCode="ABCDE"
      user={{ id: "you", name: "You" }}
    />
  );
}
