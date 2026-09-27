import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import type { RoomGameState, GameEvent } from "@big-two/game-state-machine";

import { honoClient } from "~/libs/hono-client";
import { GameRoom, type GameRoomUser } from "./game-room";
import type { ChatMessage } from "./room-chat";

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
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          // Expired rooms can return an ordinary 404 rather than a JSON action error.
        }
        throw new Error(
          body && typeof body === "object" && "error" in body && typeof body.error === "string"
            ? body.error
            : "Could not complete the game action. Please try again.",
        );
      }
    },
    [roomId],
  );

  const sendChat = useCallback(
    async (input: { text: string; clientSendId: string }): Promise<ChatMessage> => {
      const response = await honoClient.api.room.chat[":roomId"].$post({
        param: { roomId },
        json: input,
      });
      const body: unknown = await response.json();
      if (!response.ok)
        throw new Error(
          body && typeof body === "object" && "error" in body && typeof body.error === "string"
            ? body.error
            : "Could not confirm this message. Please try again.",
        );
      if (
        !body ||
        typeof body !== "object" ||
        !("type" in body) ||
        body.type !== "message" ||
        !("id" in body) ||
        typeof body.id !== "string" ||
        !("order" in body) ||
        typeof body.order !== "number" ||
        !("text" in body) ||
        typeof body.text !== "string" ||
        !("author" in body) ||
        typeof body.author !== "string" ||
        !("clientSendId" in body) ||
        typeof body.clientSendId !== "string"
      ) {
        throw new Error("Could not confirm this message. Keep your draft and try again.");
      }
      return body as ChatMessage;
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
      sendChat={sendChat}
      tableLabel={`Room ${roomId}`}
      roomCode={roomId}
      user={user}
    />
  );
}
