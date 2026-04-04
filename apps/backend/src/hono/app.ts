import { Hono } from "hono";
import { cors } from "hono/cors";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";

import { getDb } from "@big-two/data-ops/database";
import { roomTable } from "@big-two/data-ops/drizzle/schema";

import { auth } from "../lib/auth";

export const App = new Hono<{ Bindings: Cloudflare.Env }>()
  .use(
    "*",
    cors({
      origin: ["https://local.bigtwo.com"],
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    }),
  )
  .on(["POST", "GET"], "/api/auth/*", (c) => {
    return auth.handler(c.req.raw);
  })
  .get("/", async (c) => {
    return c.text("Hello, World!");
  })
  .get("/api/room/:roomId", async (c) => {
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

    const gameState = await roomStub.getGameState();
    return c.json(gameState);
  })
  .get("/api/room/ws/:roomid", async (c) => {
    const upgradeHeader = c.req.header("Upgrade");
    if (!upgradeHeader || upgradeHeader !== "websocket") {
      return c.text("Expected Upgrade: websocket", 426);
    }

    const roomId = c.req.param().roomid;
    if (!roomId) return c.notFound();

    const doId = c.env.BIG_TWO_ROOM_DURABLE_OBJECT.idFromName(roomId);
    const stub = c.env.BIG_TWO_ROOM_DURABLE_OBJECT.get(doId);
    return await stub.fetch(c.req.raw);
  })

  .post("/api/room", async (c) => {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const roomId = nanoid(8);

    const durableObjectId = c.env.BIG_TWO_ROOM_DURABLE_OBJECT.idFromName(roomId);
    const roomStub = c.env.BIG_TWO_ROOM_DURABLE_OBJECT.get(durableObjectId);

    await roomStub.createRoom({
      id: session.user.id,
      name: session.user.name,
    });

    const db = getDb();
    await db.insert(roomTable).values({
      id: roomId,
      status: "waiting",
    });

    return c.json({
      roomId,
      roomCode: roomId,
      status: "waiting",
    });
  });

export type AppType = typeof App;
