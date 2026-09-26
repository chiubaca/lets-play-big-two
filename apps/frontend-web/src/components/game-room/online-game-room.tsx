import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import type { RoomGameState, GameEvent } from "@big-two/game-state-machine";

import { honoClient } from "~/libs/hono-client";
import { GameRoom, type GameRoomUser } from "./game-room";

export function OnlineGameRoom({ roomId, user }: { roomId: string; user: GameRoomUser }) {
  const { data: gameState } = useQuery<RoomGameState>({
    queryKey: ["gameState", roomId],
    queryFn: () => {
      throw new Error("Game state is supplied by the room WebSocket");
    },
    enabled: false,
  });

  const send = useCallback(
    async (event: GameEvent) => {
      const response = await honoClient.api.room.action[":roomId"].$post({
        json: event,
        param: { roomId },
      });
      if (!response.ok) throw new Error("Game action failed");
    },
    [roomId],
  );

  return <GameRoom gameState={gameState} send={send} tableLabel={`Room ${roomId}`} user={user} />;
}
