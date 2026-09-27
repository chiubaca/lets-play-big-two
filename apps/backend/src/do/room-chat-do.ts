import { DurableObject } from "cloudflare:workers";
import type { ChatInput } from "../lib/chat-input";

export type ChatMessage = {
  type: "message";
  id: string;
  order: number;
  clientSendId: string;
  author: string;
  text: string;
};

type Visitor = { userId: string; sessionId: string };

export class RoomChatObject extends DurableObject<Env> {
  private pending: Promise<void> = Promise.resolve();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS chat_sequence (id INTEGER PRIMARY KEY CHECK (id = 1), value INTEGER NOT NULL)",
    );
  }

  private get roomId() {
    return this.ctx.id.name;
  }

  private async eligible(visitor: Visitor): Promise<{ seatName: string | null } | null> {
    if (!this.roomId) return null;
    const result = await this.env.BIG_TWO_DB.prepare(`
      SELECT s.id FROM session s JOIN user u ON u.id = s.user_id
      JOIN room r ON r.id = ?
      WHERE s.id = ? AND s.user_id = ? AND s.expires_at > ?
      AND NOT EXISTS (SELECT 1 FROM accountDeletion d WHERE d.user_id = s.user_id)
    `)
      .bind(this.roomId, visitor.sessionId, visitor.userId, Date.now())
      .first();
    if (!result) return null;
    return this.env.BIG_TWO_ROOM_DURABLE_OBJECT.getByName(this.roomId).getChatSeat(visitor.userId);
  }

  async fetch(request: Request): Promise<Response> {
    const userId = request.headers.get("X-Chat-User-ID");
    const sessionId = request.headers.get("X-Chat-Session-ID");
    if (!userId || !sessionId || !(await this.eligible({ userId, sessionId }))) {
      return new Response("Room chat is unavailable", { status: 403 });
    }
    const [client, server] = Object.values(new WebSocketPair());
    server.serializeAttachment({ userId, sessionId } satisfies Visitor);
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
    const seat = await this.eligible(visitor);
    if (!seat) return { error: "Room chat is no longer available. Reopen the room.", status: 403 };
    if (!seat.seatName)
      return { error: "Only seated Players can send room chat. Join a seat first.", status: 403 };

    const row = this.ctx.storage.sql
      .exec<{ value: number }>(`
      INSERT INTO chat_sequence (id, value) VALUES (1, 1)
      ON CONFLICT(id) DO UPDATE SET value = value + 1 RETURNING value
    `)
      .one();
    const message: ChatMessage = {
      type: "message",
      id: `${this.roomId}:${row.value}`,
      order: row.value,
      clientSendId: input.clientSendId,
      author: seat.seatName,
      text: input.text,
    };
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
