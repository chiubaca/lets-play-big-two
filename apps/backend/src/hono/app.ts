import { Hono } from "hono";
import { cors } from "hono/cors";
import { nanoid } from "nanoid";
import { auth } from "../lib/auth";
import { getDb } from "@big-two/data-ops/database";
import { roomTable, usersToRoomsTable } from "@big-two/data-ops/drizzle/schema";

// Server app with Cloudflare bindings
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
  .post("/api/rooms", async (c) => {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });
    console.log("🔍 ~ postcallback ~ apps/backend/src/hono/app.ts:26 ~ session:", session);

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

    await db.insert(usersToRoomsTable).values({
      userId: session.user.id,
      roomId: roomId,
    });

    return c.json({
      roomId,
      roomCode: roomId,
      status: "waiting",
    });
  });

export type AppType = typeof App;
