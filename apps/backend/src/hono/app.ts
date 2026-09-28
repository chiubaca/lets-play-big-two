import { Hono } from "hono";
import { sValidator } from "@hono/standard-validator";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@big-two/data-ops/database";
import {
  accountDeletionTable,
  roomTable,
  turnNotificationPreferenceTable,
  userTable,
  usersToRoomsTable,
} from "@big-two/data-ops/drizzle/schema";
import { gameEventSchema, type BigTwoGameMachineSnapshot } from "@big-two/game-state-machine";

import { auth } from "../lib/auth";
import { chooseJevBotMoveWithFallback } from "../lib/jev-bot";
import { jevBotMoveRequestSchema } from "../lib/jev-bot.schema";
import { createRoomCode } from "../lib/room-code";
import { parseChatInput } from "../lib/chat-input";
import { mintTurnTicket, readTurnTicket } from "../lib/turn-ticket";
import { MAX_TURN_INSTALLS } from "../lib/turn-push";

const allowedOrigins = ["https://local.bigtwo.com", "https://big-two.chiubaca.com"];

async function accountDeletionIsPending(userId: string) {
  const db = getDb();
  const deletion = await db
    .select({ userId: accountDeletionTable.userId })
    .from(accountDeletionTable)
    .where(eq(accountDeletionTable.userId, userId))
    .limit(1);
  return deletion.length > 0;
}

function requestOriginAllowed(request: Request) {
  const origin = request.headers.get("Origin");
  return !origin || allowedOrigins.includes(origin);
}

function roomUnavailable(room: { status: string | null; expiresAt: number | null } | undefined) {
  return (
    !room || room.status === "expiring" || (room.expiresAt != null && room.expiresAt <= Date.now())
  );
}

const subscriptionSchema = z
  .object({
    endpoint: z.string().max(2048).url(),
    keys: z.object({ p256dh: z.string().max(128), auth: z.string().max(64) }).strict(),
    generation: z.number().int().nonnegative(),
  })
  .strict();

function validSubscription(input: z.infer<typeof subscriptionSchema>) {
  let url: URL;
  try {
    url = new URL(input.endpoint);
  } catch {
    return false;
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash
  )
    return false;
  if (
    !(
      (url.hostname === "fcm.googleapis.com" &&
        /^\/(?:fcm\/send|wp)\/[A-Za-z0-9_:-]+$/.test(url.pathname)) ||
      (url.hostname === "updates.push.services.mozilla.com" &&
        /^\/wpush\/v2\/[A-Za-z0-9_-]+$/.test(url.pathname))
    )
  )
    return false;
  try {
    const decode = (key: string) => {
      if (!/^[A-Za-z0-9_-]+$/.test(key)) return null;
      return Uint8Array.from(atob(key.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
        c.charCodeAt(0),
      );
    };
    const publicKey = decode(input.keys.p256dh);
    const authSecret = decode(input.keys.auth);
    return publicKey?.length === 65 && publicKey[0] === 4 && authSecret?.length === 16;
  } catch {
    return false;
  }
}

async function endpointId(endpoint: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function limitedDeviceBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Invalid body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 4096) {
      await reader.cancel();
      throw new RangeError("Body too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export const App = new Hono<{ Bindings: Cloudflare.Env }>()
  .use(
    "*",
    cors({
      origin: allowedOrigins,
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    }),
  )
  .on(["POST", "GET"], "/api/auth/*", (c) => {
    return auth.handler(c.req.raw);
  })
  .get("/", async (c) => {
    return c.text("sup");
  })
  .get("/api/turn-notifications/preference", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    if (await accountDeletionIsPending(session.user.id))
      return c.json({ error: "Account deletion is in progress" }, 409);
    const db = getDb();
    const user = await db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.id, session.user.id))
      .limit(1);
    if (!user.length) return c.json({ error: "Account not found" }, 404);
    const preference = await db
      .select({ enabled: turnNotificationPreferenceTable.enabled })
      .from(turnNotificationPreferenceTable)
      .where(eq(turnNotificationPreferenceTable.userId, session.user.id))
      .limit(1);
    return c.json({ enabled: preference[0]?.enabled ?? false }, 200, {
      "Cache-Control": "no-store",
    });
  })
  .put(
    "/api/turn-notifications/preference",
    bodyLimit({
      maxSize: 1024,
      onError: (c) => c.json({ error: "Request body is too large" }, 413),
    }),
    async (c) => {
      const session = await auth.api.getSession({ headers: c.req.raw.headers });
      if (!session) return c.json({ error: "Unauthorized" }, 401);
      if (!requestOriginAllowed(c.req.raw)) return c.json({ error: "Origin is not allowed" }, 403);
      if (await accountDeletionIsPending(session.user.id))
        return c.json({ error: "Account deletion is in progress" }, 409);
      let input: unknown;
      try {
        input = await c.req.json();
      } catch {
        return c.json({ error: "Send a JSON preference" }, 400);
      }
      const parsed = z.object({ enabled: z.boolean() }).strict().safeParse(input);
      if (!parsed.success) return c.json({ error: "Invalid preference" }, 400);
      const db = getDb();
      const user = await db
        .select({ id: userTable.id })
        .from(userTable)
        .where(eq(userTable.id, session.user.id))
        .limit(1);
      if (!user.length) return c.json({ error: "Account not found" }, 404);
      if (!parsed.data.enabled) {
        // D1 batch is transactional: a re-on and fresh enrollment cannot be erased by a late delete.
        await c.env.BIG_TWO_DB.batch([
          c.env.BIG_TWO_DB.prepare(`INSERT INTO turnNotificationPreference (user_id, enabled, generation)
            VALUES (?, 0, 0) ON CONFLICT(user_id) DO UPDATE SET enabled = 0,
            generation = generation + CASE WHEN enabled = 1 THEN 1 ELSE 0 END`).bind(
            session.user.id,
          ),
          c.env.BIG_TWO_DB.prepare(
            "DELETE FROM turnNotificationRegistration WHERE user_id = ?",
          ).bind(session.user.id),
        ]);
        return c.json({ enabled: false }, 200, { "Cache-Control": "no-store" });
      }
      const saved = await db
        .insert(turnNotificationPreferenceTable)
        .values({ userId: session.user.id, enabled: true })
        .onConflictDoUpdate({
          target: turnNotificationPreferenceTable.userId,
          set: { enabled: true },
        })
        .returning({ enabled: turnNotificationPreferenceTable.enabled });
      if (!saved.length) return c.json({ error: "Could not save preference" }, 409);
      return c.json({ enabled: saved[0].enabled }, 200, { "Cache-Control": "no-store" });
    },
  )
  .get("/api/turn-notifications/device", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    if (await accountDeletionIsPending(session.user.id))
      return c.json({ error: "Account deletion is in progress" }, 409);
    const id = c.req.query("endpointId");
    if (id && !/^[a-f0-9]{64}$/.test(id)) return c.json({ error: "Invalid device" }, 400);
    const db = getDb();
    const preference = await db
      .select({
        enabled: turnNotificationPreferenceTable.enabled,
        generation: turnNotificationPreferenceTable.generation,
      })
      .from(turnNotificationPreferenceTable)
      .where(eq(turnNotificationPreferenceTable.userId, session.user.id))
      .limit(1);
    const generation = preference[0]?.generation ?? 0;
    const registration =
      id && preference[0]?.enabled
        ? await c.env.BIG_TWO_DB.prepare(
            "SELECT 1 AS registered FROM turnNotificationRegistration r JOIN session s ON s.id = r.session_id AND s.user_id = r.user_id WHERE r.endpoint_id = ? AND r.user_id = ? AND r.session_id = ? AND r.generation = ? AND s.expires_at > ?",
          )
            .bind(id, session.user.id, session.session.id, generation, Date.now())
            .first()
        : null;
    return c.json({ generation, registered: Boolean(registration) }, 200, {
      "Cache-Control": "no-store",
    });
  })
  .post("/api/turn-notifications/device", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    if (!requestOriginAllowed(c.req.raw)) return c.json({ error: "Origin is not allowed" }, 403);
    if (await accountDeletionIsPending(session.user.id))
      return c.json({ error: "Account deletion is in progress" }, 409);
    let body: unknown;
    try {
      body = await limitedDeviceBody(c.req.raw);
    } catch (error) {
      return c.json(
        {
          error: error instanceof RangeError ? "Request body is too large" : "Invalid subscription",
        },
        error instanceof RangeError ? 413 : 400,
      );
    }
    const parsed = subscriptionSchema.safeParse(body);
    if (!parsed.success || !validSubscription(parsed.data))
      return c.json({ error: "Invalid subscription" }, 400);
    const { endpoint, keys, generation } = parsed.data;
    const id = await endpointId(endpoint);
    // One statement ties the registration to the live originating session and current consent generation.
    let result: Record<string, unknown> | null;
    try {
      result = await c.env.BIG_TWO_DB.prepare(`INSERT INTO turnNotificationRegistration
      (endpoint_id, endpoint, p256dh, auth, user_id, session_id, generation)
      SELECT ?, ?, ?, ?, p.user_id, s.id, p.generation
      FROM turnNotificationPreference p JOIN session s ON s.user_id = p.user_id
      WHERE p.user_id = ? AND s.id = ? AND s.expires_at > ? AND p.enabled = 1 AND p.generation = ?
        AND NOT EXISTS (SELECT 1 FROM accountDeletion d WHERE d.user_id = p.user_id)
        AND (EXISTS (SELECT 1 FROM turnNotificationRegistration existing
          WHERE existing.endpoint_id = ? AND existing.user_id = p.user_id)
          OR (SELECT count(*) FROM turnNotificationRegistration enrolled
            WHERE enrolled.user_id = p.user_id AND enrolled.generation = p.generation) < ?)
      ON CONFLICT(endpoint_id) DO UPDATE SET
        p256dh = excluded.p256dh, auth = excluded.auth,
        session_id = excluded.session_id, generation = excluded.generation
      WHERE turnNotificationRegistration.user_id = excluded.user_id
        AND ((turnNotificationRegistration.session_id = excluded.session_id
          AND turnNotificationRegistration.generation = excluded.generation)
          OR NOT EXISTS (SELECT 1 FROM session prior WHERE prior.id = turnNotificationRegistration.session_id AND prior.expires_at > ?))
      RETURNING endpoint_id`)
        .bind(
          id,
          endpoint,
          keys.p256dh,
          keys.auth,
          session.user.id,
          session.session.id,
          Date.now(),
          generation,
          id,
          MAX_TURN_INSTALLS,
          Date.now(),
        )
        .first();
    } catch {
      // D1 errors can contain SQL bindings, which include subscription keys.
      return c.json({ error: "Could not register this device" }, 503);
    }
    if (!result)
      return c.json(
        {
          error:
            "Enrollment is unavailable; check consent and session, or remove another device (limit 8)",
        },
        409,
      );
    return c.json({ registered: true }, 200, { "Cache-Control": "no-store" });
  })
  .delete("/api/turn-notifications/device", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    if (!requestOriginAllowed(c.req.raw)) return c.json({ error: "Origin is not allowed" }, 403);
    if (await accountDeletionIsPending(session.user.id))
      return c.json({ error: "Account deletion is in progress" }, 409);
    let body: unknown;
    try {
      body = await limitedDeviceBody(c.req.raw);
    } catch (error) {
      return c.json(
        { error: error instanceof RangeError ? "Request body is too large" : "Invalid device" },
        error instanceof RangeError ? 413 : 400,
      );
    }
    const parsed = z
      .object({ endpointId: z.string().regex(/^[a-f0-9]{64}$/) })
      .strict()
      .safeParse(body);
    if (!parsed.success) return c.json({ error: "Invalid device" }, 400);
    await c.env.BIG_TWO_DB.prepare(
      "DELETE FROM turnNotificationRegistration WHERE endpoint_id = ? AND user_id = ? AND session_id = ?",
    )
      .bind(parsed.data.endpointId, session.user.id, session.session.id)
      .run();
    return c.json({ registered: false }, 200, { "Cache-Control": "no-store" });
  })
  .post("/api/turn-notifications/focus/:roomId", bodyLimit({ maxSize: 1024 }), async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    if (!requestOriginAllowed(c.req.raw)) return c.json({ error: "Origin is not allowed" }, 403);
    const parsed = z
      .object({
        tabId: z.string().uuid(),
        focused: z.boolean(),
        sequence: z.number().int().nonnegative().safe(),
      })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Invalid focus" }, 400);
    const roomId = c.req.param("roomId");
    if (!/^[A-Z0-9]{5}$/.test(roomId)) return c.notFound();
    const result = await c.env.BIG_TWO_ROOM_DURABLE_OBJECT.getByName(roomId).setRoomFocus(
      roomId,
      session.user.id,
      session.session.id,
      parsed.data.tabId,
      parsed.data.focused,
      parsed.data.sequence,
    );
    return result ? c.json({ ok: true }, 200, { "Cache-Control": "no-store" }) : c.notFound();
  })
  .get("/api/turn-notifications/check", async (c) => {
    const deny = () => c.json({ eligible: false }, 200, { "Cache-Control": "no-store" });
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return deny();
    const roomId = c.req.query("roomId");
    const turnId = c.req.query("turnId");
    const endpointId = c.req.query("endpointId");
    if (
      !roomId ||
      !/^[A-Z0-9]{5}$/.test(roomId) ||
      !turnId ||
      !/^[a-f0-9-]{36}$/.test(turnId) ||
      !endpointId ||
      !/^[a-f0-9]{64}$/.test(endpointId) ||
      !c.env.VAPID_PRIVATE_KEY
    )
      return deny();
    try {
      const registration = await c.env.BIG_TWO_DB.prepare(
        "SELECT generation FROM turnNotificationRegistration WHERE endpoint_id = ? AND user_id = ? AND session_id = ?",
      )
        .bind(endpointId, session.user.id, session.session.id)
        .first<{ generation: number }>();
      if (!registration) return deny();
      const eligible = await c.env.BIG_TWO_ROOM_DURABLE_OBJECT.getByName(roomId).verifyFirstTurn(
        roomId,
        turnId,
        session.user.id,
        {
          endpoint_id: endpointId,
          session_id: session.session.id,
          generation: registration.generation,
        },
      );
      if (!eligible) return deny();
      const ticket = await mintTurnTicket(c.env.VAPID_PRIVATE_KEY, roomId, session.user.id);
      return c.json({ eligible: true, target: `/turn-return?ticket=${ticket}` }, 200, {
        "Cache-Control": "no-store",
      });
    } catch {
      return deny();
    }
  })
  .get("/api/turn-notifications/return", async (c) => {
    const deny = () => c.json({ allowed: false }, 200, { "Cache-Control": "no-store" });
    const ticket = c.req.query("ticket");
    if (!ticket) return deny();
    const decoded = await readTurnTicket(c.env.VAPID_PRIVATE_KEY, ticket);
    if (!decoded) return deny();
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session || session.user.id !== decoded.userId) return deny();
    try {
      if (await accountDeletionIsPending(decoded.userId)) return deny();
      const room = await c.env.BIG_TWO_DB.prepare(
        "SELECT status, expires_at FROM room WHERE id = ?",
      )
        .bind(decoded.roomId)
        .first<{ status: string; expires_at: number | null }>();
      if (
        !room ||
        room.status === "expiring" ||
        (room.expires_at !== null && room.expires_at <= Date.now())
      )
        return c.json({ allowed: true, missing: true }, 200, { "Cache-Control": "no-store" });
      const seat = await c.env.BIG_TWO_ROOM_DURABLE_OBJECT.getByName(decoded.roomId).getChatSeat(
        decoded.userId,
      );
      if (!seat?.seatName) return deny();
      return c.json({ allowed: true, target: `/room/${decoded.roomId}` }, 200, {
        "Cache-Control": "no-store",
      });
    } catch {
      return deny();
    }
  })
  .get("/api/rooms", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "Unauthorized" }, 401);

    const db = getDb();
    const memberships = await db
      .select({ roomId: roomTable.id, status: roomTable.status, expiresAt: roomTable.expiresAt })
      .from(usersToRoomsTable)
      .innerJoin(roomTable, eq(usersToRoomsTable.roomId, roomTable.id))
      .where(eq(usersToRoomsTable.userId, session.user.id));

    const rooms = await Promise.all(
      memberships
        .filter(({ status, expiresAt }) => !roomUnavailable({ status, expiresAt }))
        .map(async ({ roomId }) => {
          const stub = c.env.BIG_TWO_ROOM_DURABLE_OBJECT.getByName(roomId);
          const storedState = await stub.getGameState();
          if (!storedState) return null;
          const state = JSON.parse(storedState) as BigTwoGameMachineSnapshot;
          if (!state.context.players.some((player) => player.id === session.user.id)) return null;
          return {
            roomId,
            status:
              state.value === "WAITING_FOR_PLAYERS"
                ? "waiting"
                : state.value === "GAME_END"
                  ? "finished"
                  : "playing",
            playerCount: state.context.players.length,
          };
        }),
    );
    return c.json({ rooms: rooms.filter((room) => room !== null) }, 200, {
      "Cache-Control": "no-store",
    });
  })
  .post(
    "/api/bot/jev/move",
    bodyLimit({
      maxSize: 32 * 1024,
      onError: (c) => c.json({ error: "Request body is too large" }, 413),
    }),
    sValidator("json", jevBotMoveRequestSchema, (result, c) => {
      if (!result.success) {
        return c.json({ error: "Validation failed", issues: result.error }, 400);
      }
    }),
    async (c) => {
      const rateLimit = await c.env.JEV_MOVE_RATE_LIMITER.limit({
        key: c.req.header("CF-Connecting-IP") ?? "local-development",
      });
      if (!rateLimit.success) return c.json({ error: "Too many Jev move requests" }, 429);

      const decision = await chooseJevBotMoveWithFallback(c.req.valid("json"), {
        ai: c.env.AI,
      });
      return c.json(decision, 200, { "Cache-Control": "no-store" });
    },
  )
  .get("/api/room/:roomId", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    if (await accountDeletionIsPending(session.user.id)) {
      return c.json({ error: "Account deletion is in progress" }, 409);
    }
    const roomId = c.req.param().roomId;
    if (!roomId) {
      return new Response("no room id provided", { status: 404 });
    }
    const db = getDb();
    const rooms = await db.select().from(roomTable).where(eq(roomTable.id, roomId));
    if (roomUnavailable(rooms[0])) {
      return c.notFound();
    }

    const roomIdFromDb = rooms[0].id;

    const durableObjectId = c.env.BIG_TWO_ROOM_DURABLE_OBJECT.idFromName(roomIdFromDb);
    const roomStub = c.env.BIG_TWO_ROOM_DURABLE_OBJECT.get(durableObjectId);

    const gameState = await roomStub.getRoomView(session.user.id, roomId);
    if (!gameState) return c.notFound();
    return c.json(gameState, 200, { "Cache-Control": "no-store" });
  })
  .get("/api/room/ws/:roomid", async (c) => {
    const upgradeHeader = c.req.header("Upgrade");
    if (!upgradeHeader || upgradeHeader !== "websocket") {
      return c.text("Expected Upgrade: websocket", 426);
    }

    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (await accountDeletionIsPending(session.user.id)) {
      return c.json({ error: "Account deletion is in progress" }, 409);
    }

    const roomId = c.req.param().roomid;
    if (!roomId) return c.notFound();

    const rooms = await getDb()
      .select({ id: roomTable.id, status: roomTable.status, expiresAt: roomTable.expiresAt })
      .from(roomTable)
      .where(eq(roomTable.id, roomId))
      .limit(1);
    if (roomUnavailable(rooms[0])) return c.notFound();

    const doId = c.env.BIG_TWO_ROOM_DURABLE_OBJECT.idFromName(roomId);
    const stub = c.env.BIG_TWO_ROOM_DURABLE_OBJECT.get(doId);
    const headers = new Headers(c.req.raw.headers);
    headers.set("X-Room-Viewer-ID", session.user.id);
    headers.set("X-Room-Session-ID", session.session.id);
    headers.set("X-Room-ID", roomId);
    return await stub.fetch(new Request(c.req.raw, { headers }));
  })
  .get("/api/room/chat/ws/:roomId", async (c) => {
    if (!requestOriginAllowed(c.req.raw)) return c.json({ error: "Origin is not allowed" }, 403);
    if (c.req.header("Upgrade")?.toLowerCase() !== "websocket") {
      return c.text("Expected Upgrade: websocket", 426);
    }
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    if (await accountDeletionIsPending(session.user.id)) {
      return c.json({ error: "Account deletion is in progress" }, 409);
    }
    const roomId = c.req.param("roomId");
    const room = await getDb()
      .select({ id: roomTable.id, status: roomTable.status, expiresAt: roomTable.expiresAt })
      .from(roomTable)
      .where(eq(roomTable.id, roomId))
      .limit(1);
    if (roomUnavailable(room[0])) return c.notFound();
    const headers = new Headers(c.req.raw.headers);
    headers.set("X-Chat-User-ID", session.user.id);
    headers.set("X-Chat-Session-ID", session.session.id);
    headers.set("X-Chat-Room-ID", roomId);
    return c.env.ROOM_CHAT_DURABLE_OBJECT.getByName(roomId).fetch(
      new Request(c.req.raw, { headers }),
    );
  })
  .get("/api/room/chat/:roomId", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    if (await accountDeletionIsPending(session.user.id)) {
      return c.json({ error: "Account deletion is in progress" }, 409);
    }
    const roomId = c.req.param("roomId");
    const room = await getDb()
      .select({ id: roomTable.id, status: roomTable.status, expiresAt: roomTable.expiresAt })
      .from(roomTable)
      .where(eq(roomTable.id, roomId))
      .limit(1);
    if (roomUnavailable(room[0])) return c.notFound();
    const before = c.req.query("before");
    const after = c.req.query("after");
    const validCursor = (value: string | undefined) =>
      value === undefined || (/^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)));
    if (!validCursor(before) || !validCursor(after) || (before && after)) {
      return c.json({ error: "Invalid history cursor" }, 400);
    }
    const page = await c.env.ROOM_CHAT_DURABLE_OBJECT.getByName(roomId).history(
      { roomId, userId: session.user.id, sessionId: session.session.id },
      before ? Number(before) : undefined,
      after ? Number(after) : undefined,
    );
    if (!page) return c.notFound();
    return c.json(page, 200, { "Cache-Control": "no-store" });
  })
  .post(
    "/api/room/chat/:roomId",
    async (c, next) => {
      if (!requestOriginAllowed(c.req.raw)) return c.json({ error: "Origin is not allowed" }, 403);
      const reader = c.req.raw.clone().body?.getReader();
      if (reader) {
        let size = 0;
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 8 * 1024) {
            void reader.cancel().catch(() => {});
            return c.json({ error: "Keep the request body under 8 KiB." }, 413);
          }
        }
      }
      try {
        await c.req.json();
      } catch {
        return c.json({ error: "Send a JSON message with text and a client send ID." }, 400);
      }
      await next();
    },
    sValidator(
      "json",
      z.object({ text: z.string(), clientSendId: z.string() }).strict(),
      (result, c) => {
        if (!result.success)
          return c.json({ error: "Send plain text and a UUID client send ID only." }, 400);
      },
    ),
    async (c) => {
      const session = await auth.api.getSession({ headers: c.req.raw.headers });
      if (!session) return c.json({ error: "Unauthorized" }, 401);
      if (await accountDeletionIsPending(session.user.id)) {
        return c.json({ error: "Account deletion is in progress" }, 409);
      }
      const roomId = c.req.param("roomId");
      const room = await getDb()
        .select({ id: roomTable.id, status: roomTable.status, expiresAt: roomTable.expiresAt })
        .from(roomTable)
        .where(eq(roomTable.id, roomId))
        .limit(1);
      if (roomUnavailable(room[0])) return c.notFound();
      const parsed = parseChatInput(c.req.valid("json"));
      if (!parsed.input) return c.json({ error: parsed.error }, 400);
      const result = await c.env.ROOM_CHAT_DURABLE_OBJECT.getByName(roomId).send(
        { roomId, userId: session.user.id, sessionId: session.session.id },
        parsed.input,
      );
      if (!result.message)
        return c.json(
          { error: result.error ?? "Room chat is unavailable" },
          result.status === 409 ? 409 : 403,
        );
      return c.json(result.message, 200, { "Cache-Control": "no-store" });
    },
  )

  .post("/api/room", async (c) => {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (await accountDeletionIsPending(session.user.id)) {
      return c.json({ error: "Account deletion is in progress" }, 409);
    }

    const db = getDb();
    let roomId: string | undefined;
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = createRoomCode();
      const createdAt = Date.now();
      const inserted = await db
        .insert(roomTable)
        .values({
          id: candidate,
          status: "waiting",
          createdAt,
          emptySince: createdAt,
          expiresAt: createdAt + 48 * 60 * 60 * 1000,
        })
        .onConflictDoNothing()
        .returning({ id: roomTable.id });
      if (inserted.length > 0) {
        roomId = candidate;
        break;
      }
    }
    if (!roomId) return c.json({ error: "Couldn’t find an available room code" }, 503);

    const durableObjectId = c.env.BIG_TWO_ROOM_DURABLE_OBJECT.idFromName(roomId);
    const roomStub = c.env.BIG_TWO_ROOM_DURABLE_OBJECT.get(durableObjectId);

    await roomStub.createRoom({
      id: session.user.id,
      name: session.user.name,
    });

    if (await accountDeletionIsPending(session.user.id)) {
      await roomStub.redactPlayer(session.user.id);
      return c.json({ error: "Account deletion is in progress" }, 409);
    }

    await db.insert(usersToRoomsTable).values({ userId: session.user.id, roomId });

    return c.json({
      roomId,
      roomCode: roomId,
      status: "waiting",
    });
  })
  .post(
    "/api/room/action/:roomId",
    sValidator("json", gameEventSchema, (result, c) => {
      if (!result.success) {
        console.error("❌ Validation error:", JSON.stringify(result.error, null, 2));
        return c.json({ error: "Validation failed", issues: result.error }, 400);
      }
    }),
    async (c) => {
      const session = await auth.api.getSession({
        headers: c.req.raw.headers,
      });

      if (!session) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const gameEvent = c.req.valid("json");

      if (gameEvent.type === "JOIN_GAME" && (await accountDeletionIsPending(session.user.id))) {
        return c.json({ error: "Account deletion is in progress" }, 409);
      }

      if ("playerId" in gameEvent && gameEvent.playerId !== session.user.id) {
        return c.json({ error: "Cannot act as another player" }, 403);
      }

      const authenticatedGameEvent =
        gameEvent.type === "JOIN_GAME"
          ? { ...gameEvent, playerId: session.user.id, playerName: session.user.name }
          : gameEvent;

      const roomId = c.req.param("roomId");

      const room = await getDb()
        .select({ status: roomTable.status, expiresAt: roomTable.expiresAt })
        .from(roomTable)
        .where(eq(roomTable.id, roomId))
        .limit(1);
      if (roomUnavailable(room[0])) return c.notFound();

      const doId = c.env.BIG_TWO_ROOM_DURABLE_OBJECT.idFromName(roomId);
      const stub = c.env.BIG_TWO_ROOM_DURABLE_OBJECT.get(doId);

      const result = await stub.gameAction(authenticatedGameEvent, session.user.id, roomId);

      if (!result.success) {
        if (result.error === "Room not found") return c.notFound();
        return c.json({ error: result.error }, 403);
      }

      if (gameEvent.type === "JOIN_GAME") {
        if (await accountDeletionIsPending(session.user.id)) {
          await stub.redactPlayer(session.user.id);
          return c.json({ error: "Account deletion is in progress" }, 409);
        }
        await getDb()
          .insert(usersToRoomsTable)
          .values({ userId: session.user.id, roomId })
          .onConflictDoNothing();
      }

      return c.json({ success: true });
    },
  );

export type AppType = typeof App;
