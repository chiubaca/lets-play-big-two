export type { GameEvent, RoomGameState } from "@big-two/game-state-machine";

export interface RoomSummary {
  roomId: string;
  status: "waiting" | "playing" | "finished";
  playerCount: number;
}

export interface CreatedRoom {
  roomId: string;
  roomCode: string;
  status: "waiting";
}

export interface ChatMessage {
  type: "message";
  id: string;
  order: number;
  clientSendId: string;
  author: string;
  // Older deployed backends omit this viewer-specific flag.
  isOwn?: boolean;
  role: "Player" | "Spectator" | null;
  text: string;
}

export type ChatFrame = ChatMessage | (Omit<ChatMessage, "type"> & { type: "redaction" });
export interface ChatPage {
  messages: ChatMessage[];
  hasMore: boolean;
}
export interface ChatInput {
  text: string;
  // Reuse this UUID after a failed send to avoid duplicate messages.
  clientSendId: string;
}
export type ChatCursor = { before: number; after?: never } | { after: number; before?: never };
export type ConnectionStatus = "idle" | "connecting" | "connected" | "reconnecting";
