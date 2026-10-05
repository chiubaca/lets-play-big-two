import type { ChatFrame, ChatMessage } from "./types";

export function isChatFrame(value: unknown): value is ChatFrame {
  if (!value || typeof value !== "object") return false;
  const frame = value as Partial<ChatFrame>;
  return (
    (frame.type === "message" || frame.type === "redaction") &&
    typeof frame.id === "string" &&
    typeof frame.order === "number" &&
    Number.isSafeInteger(frame.order) &&
    frame.order > 0 &&
    typeof frame.clientSendId === "string" &&
    typeof frame.author === "string" &&
    (frame.role === null || frame.role === "Player" || frame.role === "Spectator") &&
    typeof frame.text === "string"
  );
}

export function mergeChat(
  previous: ChatMessage[],
  frames: ChatFrame[],
  redacted: Set<string>,
): ChatMessage[] {
  for (const frame of frames) if (frame.type === "redaction") redacted.add(frame.id);
  const merged = new Map(previous.map((message) => [message.id, message]));
  for (const frame of frames) merged.set(frame.id, { ...frame, type: "message" });
  return [...merged.values()]
    .map((message) =>
      redacted.has(message.id)
        ? { ...message, author: "Deleted participant", role: null, text: "Message removed" }
        : message,
    )
    .sort((a, b) => a.order - b.order);
}
