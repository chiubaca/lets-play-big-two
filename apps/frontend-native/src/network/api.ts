import type { GameEvent, RoomGameState } from "@big-two/game-state-machine";
import { authClient, type NativeUser } from "./auth-client";
import { BACKEND_URL, NATIVE_ORIGIN } from "./config";
import { createRequest } from "./request";
import type {
  ChatCursor,
  ChatInput,
  ChatMessage,
  ChatPage,
  CreatedRoom,
  RoomSummary,
} from "./types";

export const request = createRequest({
  baseURL: BACKEND_URL,
  origin: NATIVE_ORIGIN,
  getCookie: () => authClient.getCookie(),
});

const roomPath = (roomId: string) => encodeURIComponent(roomId);
export function createApi(sendRequest: typeof request) {
  const action = (roomId: string, event: GameEvent) =>
    sendRequest<{ success: true }>(`/api/room/action/${roomPath(roomId)}`, {
      method: "POST",
      json: event,
    });
  return {
    listRooms: (signal?: AbortSignal) =>
      sendRequest<{ rooms: RoomSummary[] }>("/api/rooms", { signal }),
    createRoom: () => sendRequest<CreatedRoom>("/api/room", { method: "POST" }),
    getRoom: (roomId: string, signal?: AbortSignal) =>
      sendRequest<RoomGameState>(`/api/room/${roomPath(roomId)}`, { signal }),
    action,
    joinRoom: (roomId: string, user: Pick<NativeUser, "id" | "name" | "emoji">) =>
      action(roomId, {
        type: "JOIN_GAME",
        playerId: user.id,
        playerName: user.name,
        ...(user.emoji ? { playerEmoji: user.emoji } : {}),
      }),
    leaveRoom: (roomId: string, playerId: string) =>
      action(roomId, { type: "LEAVE_GAME", playerId }),
    roomFocus: (roomId: string, input: { tabId: string; focused: boolean; sequence: number }) =>
      sendRequest<{ ok: true }>(`/api/turn-notifications/focus/${roomPath(roomId)}`, {
        method: "POST",
        json: input,
      }),
    chatHistory: (roomId: string, cursor?: ChatCursor, signal?: AbortSignal) => {
      const query = cursor
        ? `?${cursor.before !== undefined ? "before" : "after"}=${cursor.before ?? cursor.after}`
        : "";
      return sendRequest<ChatPage>(`/api/room/chat/${roomPath(roomId)}${query}`, { signal });
    },
    sendChat: (roomId: string, input: ChatInput) =>
      sendRequest<ChatMessage>(`/api/room/chat/${roomPath(roomId)}`, {
        method: "POST",
        json: input,
      }),
  };
}

export const api = createApi(request);
