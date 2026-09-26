import { Hono } from "hono";
import { sValidator } from "@hono/standard-validator";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { eq } from "drizzle-orm";

import { getDb } from "@big-two/data-ops/database";
import {
  accountDeletionTable,
  roomTable,
  usersToRoomsTable,
} from "@big-two/data-ops/drizzle/schema";
import { gameEventSchema, type BigTwoGameMachineSnapshot } from "@big-two/game-state-machine";

import { auth } from "../lib/auth";
import { chooseJevBotMoveWithFallback } from "../lib/jev-bot";
import { jevBotMoveRequestSchema } from "../lib/jev-bot.schema";
import { createRoomCode } from "../lib/room-code";

async function accountDeletionIsPending(userId: string) {
  const db = getDb();
  const deletion = await db
    .select({ userId: accountDeletionTable.userId })
    .from(accountDeletionTable)
    .where(eq(accountDeletionTable.userId, userId))
    .limit(1);
  return deletion.length > 0;
}

export const App = new Hono<{ Bindings: Cloudflare.Env }>()
  .use(
    "*",
    cors({
      origin: ["https://local.bigtwo.com", "https://big-two.chiubaca.com"],
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
  .get("/api/rooms", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "Unauthorized" }, 401);

    const db = getDb();
    const memberships = await db
      .select({ roomId: roomTable.id })
      .from(usersToRoomsTable)
      .innerJoin(roomTable, eq(usersToRoomsTable.roomId, roomTable.id))
      .where(eq(usersToRoomsTable.userId, session.user.id));

    const rooms = await Promise.all(
      memberships.map(async ({ roomId }) => {
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
    if (rooms.length === 0) {
      return c.notFound();
    }

    const roomIdFromDb = rooms[0].id;

    const durableObjectId = c.env.BIG_TWO_ROOM_DURABLE_OBJECT.idFromName(roomIdFromDb);
    const roomStub = c.env.BIG_TWO_ROOM_DURABLE_OBJECT.get(durableObjectId);

    const gameState = await roomStub.getRoomView(session.user.id);
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
      .select({ id: roomTable.id })
      .from(roomTable)
      .where(eq(roomTable.id, roomId))
      .limit(1);
    if (!rooms.length) return c.notFound();

    const doId = c.env.BIG_TWO_ROOM_DURABLE_OBJECT.idFromName(roomId);
    const stub = c.env.BIG_TWO_ROOM_DURABLE_OBJECT.get(doId);
    const headers = new Headers(c.req.raw.headers);
    headers.set("X-Room-Viewer-ID", session.user.id);
    return await stub.fetch(new Request(c.req.raw, { headers }));
  })

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
      const inserted = await db
        .insert(roomTable)
        .values({ id: candidate, status: "waiting" })
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

      const doId = c.env.BIG_TWO_ROOM_DURABLE_OBJECT.idFromName(roomId);
      const stub = c.env.BIG_TWO_ROOM_DURABLE_OBJECT.get(doId);

      const result = await stub.gameAction(authenticatedGameEvent, session.user.id);

      if (!result.success) {
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
