export type ChatInput = { text: string; clientSendId: string };

export function parseChatInput(
  value: unknown,
): { input: ChatInput; error?: never } | { input?: never; error: string } {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(",") !== "clientSendId,text"
  ) {
    return { error: "Send a message with text and a client send ID only." };
  }
  const { text, clientSendId } = value as Record<string, unknown>;
  if (
    typeof text !== "string" ||
    typeof clientSendId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientSendId)
  ) {
    return { error: "Message text must be plain text and the client send ID must be a UUID." };
  }
  const trimmed = text.trim();
  if (!trimmed) return { error: "Write a message before sending." };
  for (let index = 0; index < trimmed.length; index++) {
    const code = trimmed.charCodeAt(index);
    if ((code < 32 && code !== 10) || (code >= 127 && code <= 159)) {
      return { error: "Remove control characters; use line breaks only." };
    }
  }
  if (trimmed.split("\n").length > 3) return { error: "Use no more than three lines." };
  if (new TextEncoder().encode(trimmed).length > 4096)
    return { error: "Keep the message under 4 KiB." };
  if (
    [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(trimmed)].length > 200
  ) {
    return { error: "Keep the message to 200 characters or fewer." };
  }
  return { input: { text: trimmed, clientSendId } };
}
