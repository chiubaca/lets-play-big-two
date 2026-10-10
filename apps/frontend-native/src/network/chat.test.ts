import { describe, expect, it } from "vite-plus/test";
import { isChatFrame, mergeChat } from "./chat";
import type { ChatMessage } from "./types";

const message = (order: number): ChatMessage => ({
  type: "message",
  id: `ABCDE:${order}`,
  order,
  clientSendId: `uuid-${order}`,
  author: "Player",
  isOwn: true,
  role: "Player",
  text: "hello",
});

describe("chat reconciliation", () => {
  it("deduplicates HTTP/socket delivery and orders server's descending history", () => {
    expect(
      mergeChat([message(2)], [message(3), message(1), message(2)], new Set()).map(
        (entry) => entry.order,
      ),
    ).toEqual([1, 2, 3]);
  });

  it("does not resurrect a redacted message from a racing history response", () => {
    const redacted = new Set<string>();
    const next = mergeChat(
      [message(1)],
      [
        {
          ...message(1),
          type: "redaction",
          author: "Deleted participant",
          role: null,
          text: "Message removed",
        },
      ],
      redacted,
    );
    expect(mergeChat(next, [message(1)], redacted)).toEqual([
      {
        ...message(1),
        author: "Deleted participant",
        role: null,
        text: "Message removed",
        isOwn: false,
      },
    ]);
  });

  it("ignores malformed frames", () => {
    expect(isChatFrame(message(1))).toBe(true);
    expect(isChatFrame({ ...message(1), type: "redaction" })).toBe(true);
    expect(isChatFrame({ ...message(1), order: 1.5 })).toBe(false);
    expect(isChatFrame({ ...message(1), role: "admin" })).toBe(false);
    expect(isChatFrame({ ...message(1), isOwn: "true" })).toBe(false);
    expect(isChatFrame({ ...message(1), isOwn: undefined })).toBe(true);
    expect(isChatFrame(null)).toBe(false);
  });
});
