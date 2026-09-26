import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import type { RoomGameState, GameEvent } from "@big-two/game-state-machine";

import { honoClient } from "~/libs/hono-client";
import { GameRoom, type GameRoomUser } from "./game-room";

export function OnlineGameRoom({ roomId, user }: { roomId: string; user: GameRoomUser }) {
  const {
    data: gameState,
    error,
    refetch,
  } = useQuery<RoomGameState>({
    queryKey: ["gameState", roomId, user.id],
    queryFn: async () => {
      const response = await honoClient.api.room[":roomId"].$get({ param: { roomId } });
      if (!response.ok) {
        throw new Error(
          response.status === 404
            ? "This room could not be found."
            : "Could not connect to the table. Please try again.",
        );
      }
      return (await response.json()) as RoomGameState;
    },
    retry: false,
  });

  const send = useCallback(
    async (event: GameEvent) => {
      const response = await honoClient.api.room.action[":roomId"].$post({
        json: event,
        param: { roomId },
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error);
      }
    },
    [roomId],
  );

  if (!gameState && error) {
    return (
      <main className="game-room room-loading" role="alert">
        {error.message} <button onClick={() => void refetch()}>Retry</button>
      </main>
    );
  }

  return (
    <GameRoom
      gameState={gameState}
      send={send}
      tableLabel={`Room ${roomId}`}
      roomCode={roomId}
      user={user}
    />
  );
}
