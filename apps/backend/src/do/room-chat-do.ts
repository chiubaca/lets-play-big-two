import { DurableObject } from "cloudflare:workers";
import type { ChatInput } from "../lib/chat-input";

export type ChatMessage = {
  type: "message";
  id: string;
  order: number;
  clientSendId: string;
  author: string;
  role: "Player" | "Spectator" | null;
  text: string;
};

export type ChatPage = { messages: ChatMessage[]; hasMore: boolean };

type Visitor = { roomId: string; userId: string; sessionId: string };

export class RoomChatObject extends DurableObject<Env> {
  private pending: Promise<void> = Promise.resolve();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS chat_sequence (id INTEGER PRIMARY KEY CHECK (id = 1), value INTEGER NOT NULL)",
    );
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS chat_messages (
      order_id INTEGER PRIMARY KEY, user_id TEXT, client_send_id TEXT NOT NULL,
      author TEXT NOT NULL, role TEXT, text TEXT NOT NULL
    )`);
    ctx.storage.sql.exec(
      "CREATE INDEX IF NOT EXISTS chat_messages_user ON chat_messages (user_id)",
    );
    ctx.storage.sql.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS chat_messages_retry ON chat_messages (user_id, client_send_id)",
    );
  }

  private async eligible(
    visitor: Visitor,
  ): Promise<{ name: string; seatName: string | null } | null> {
    if (
      !visitor.roomId ||
      !this.ctx.id.equals(this.env.ROOM_CHAT_DURABLE_OBJECT.idFromName(visitor.roomId))
    ) {
      return null;
    }
    const result = await this.env.BIG_TWO_DB.prepare(`
      SELECT u.name FROM session s JOIN user u ON u.id = s.user_id
      JOIN room r ON r.id = ?
      WHERE s.id = ? AND s.user_id = ? AND s.expires_at > ?
      AND NOT EXISTS (SELECT 1 FROM accountDeletion d WHERE d.user_id = s.user_id)
    `)
      .bind(visitor.roomId, visitor.sessionId, visitor.userId, Date.now())
      .first();
    if (!result) return null;
    const seat = await this.env.BIG_TWO_ROOM_DURABLE_OBJECT.getByName(visitor.roomId).getChatSeat(
      visitor.userId,
    );
    return seat ? { name: result.name as string, seatName: seat.seatName } : null;
  }

  async history(visitor: Visitor, before?: number, after?: number): Promise<ChatPage | null> {
    if (!(await this.eligible(visitor))) return null;
    const rows = this.ctx.storage.sql
      .exec<{
        order_id: number;
        client_send_id: string;
        author: string;
        role: "Player" | "Spectator" | null;
        text: string;
      }>(
        `SELECT order_id, client_send_id, author, role, text FROM chat_messages
         WHERE order_id ${after !== undefined ? ">" : "<"} ?
         ORDER BY order_id ${after !== undefined ? "ASC" : "DESC"} LIMIT 51`,
        after ?? before ?? Number.MAX_SAFE_INTEGER,
      )
      .toArray();
    return {
      messages: rows.slice(0, 50).map((row) => ({
        type: "message",
        id: `${visitor.roomId}:${row.order_id}`,
        order: row.order_id,
        clientSendId: row.client_send_id,
        author: row.author,
        role: row.role,
        text: row.text,
      })),
      hasMore: rows.length > 50,
    };
  }

  async redactAuthor(userId: string): Promise<void> {
    const operation = this.pending.then(() => this.redactStoredAuthor(userId));
    this.pending = operation.then(
      () => {},
      () => {},
    );
    await operation;
  }

  private async redactStoredAuthor(userId: string): Promise<void> {
    const rows = this.ctx.storage.sql
      .exec<{ order_id: number; client_send_id: string }>(
        "SELECT order_id, client_send_id FROM chat_messages WHERE user_id = ?",
        userId,
      )
      .toArray();
    this.ctx.storage.sql.exec(
      "UPDATE chat_messages SET user_id = NULL, author = 'Deleted participant', role = NULL, text = 'Message removed' WHERE user_id = ?",
      userId,
    );
    await this.ctx.storage.sync();
    for (const socket of this.ctx.getWebSockets()) {
      const visitor = socket.deserializeAttachment() as Visitor | null;
      if (!visitor || !(await this.eligible(visitor))) {
        socket.close(1008, "Room chat access ended");
        continue;
      }
      for (const row of rows) {
        try {
          socket.send(
            JSON.stringify({
              type: "redaction",
              id: `${visitor.roomId}:${row.order_id}`,
              order: row.order_id,
              author: "Deleted participant",
              role: null,
              text: "Message removed",
              clientSendId: row.client_send_id,
            }),
          );
        } catch {
          socket.close(1011, "Chat connection unavailable");
          break;
        }
      }
    }
  }

  async fetch(request: Request): Promise<Response> {
    const userId = request.headers.get("X-Chat-User-ID");
    const sessionId = request.headers.get("X-Chat-Session-ID");
    const roomId = request.headers.get("X-Chat-Room-ID");
    if (!userId || !sessionId || !roomId || !(await this.eligible({ roomId, userId, sessionId }))) {
      return new Response("Room chat is unavailable", { status: 403 });
    }
    const [client, server] = Object.values(new WebSocketPair());
    server.serializeAttachment({ roomId, userId, sessionId } satisfies Visitor);
    this.ctx.acceptWebSocket(server);
    await this.ctx.storage.setAlarm(Date.now() + 10_000);
    return new Response(null, { status: 101, webSocket: client });
  }

  async send(
    visitor: Visitor,
    input: ChatInput,
  ): Promise<{ message?: ChatMessage; error?: string; status?: number }> {
    const result = this.pending.then(() => this.accept(visitor, input));
    this.pending = result.then(
      () => {},
      () => {},
    );
    return result;
  }

  private async accept(visitor: Visitor, input: ChatInput) {
    const sender = await this.eligible(visitor);
    if (!sender)
      return { error: "Room chat is no longer available. Reopen the room.", status: 403 };
    const existing = this.ctx.storage.sql
      .exec<{
        order_id: number;
        author: string;
        role: "Player" | "Spectator" | null;
        text: string;
      }>(
        "SELECT order_id, author, role, text FROM chat_messages WHERE user_id = ? AND client_send_id = ?",
        visitor.userId,
        input.clientSendId,
      )
      .toArray()[0];
    if (existing) {
      if (existing.text !== input.text)
        return { error: "Retry the same message or start a new one.", status: 409 };
      return {
        message: {
          type: "message" as const,
          id: `${visitor.roomId}:${existing.order_id}`,
          order: existing.order_id,
          clientSendId: input.clientSendId,
          author: existing.author,
          role: existing.role,
          text: existing.text,
        },
      };
    }
    const row = this.ctx.storage.sql
      .exec<{ value: number }>(`
      INSERT INTO chat_sequence (id, value) VALUES (1, 1)
      ON CONFLICT(id) DO UPDATE SET value = value + 1 RETURNING value
    `)
      .one();
    const message: ChatMessage = {
      type: "message",
      id: `${visitor.roomId}:${row.value}`,
      order: row.value,
      clientSendId: input.clientSendId,
      author: sender.name,
      role: sender.seatName ? "Player" : "Spectator",
      text: input.text,
    };
    this.ctx.storage.sql.exec(
      "INSERT INTO chat_messages (order_id, user_id, client_send_id, author, role, text) VALUES (?, ?, ?, ?, ?, ?)",
      row.value,
      visitor.userId,
      input.clientSendId,
      message.author,
      message.role,
      message.text,
    );
    await this.ctx.storage.sync();
    const payload = JSON.stringify(message);
    for (const socket of this.ctx.getWebSockets()) {
      try {
        const viewer = socket.deserializeAttachment() as Visitor | null;
        if (viewer && (await this.eligible(viewer))) socket.send(payload);
        else socket.close(1008, "Room chat access ended");
      } catch {
        // A failed delivery must not turn an already accepted message into a failed HTTP send.
        try {
          socket.close(1011, "Chat connection unavailable");
        } catch {
          /* Already closed. */
        }
      }
    }
    return { message };
  }

  async alarm() {
    for (const socket of this.ctx.getWebSockets()) {
      const visitor = socket.deserializeAttachment() as Visitor | null;
      if (!visitor || !(await this.eligible(visitor))) socket.close(1008, "Room chat access ended");
    }
    if (this.ctx.getWebSockets().length) await this.ctx.storage.setAlarm(Date.now() + 10_000);
  }

  webSocketMessage(socket: WebSocket) {
    socket.close(1008, "Room chat WebSocket is receive-only");
  }
}
