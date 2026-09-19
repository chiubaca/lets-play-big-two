import { betterAuth } from "better-auth";
import { username } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";

import { getDb } from "@big-two/data-ops/database";
import * as schema from "@big-two/data-ops/drizzle/schema";

import { env } from "cloudflare:workers";

export const auth = betterAuth({
  database: drizzleAdapter(drizzle(env.BIG_TWO_DB), {
    provider: "sqlite",
    schema: {
      ...schema,
      user: schema.userTable,
      session: schema.sessionTable,
      account: schema.accountTable,
      verification: schema.verification,
    },
  }),
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: ["https://local.bigtwo.com", "https://big-two.chiubaca.com"],
  advanced: {
    ipAddress: {
      ipAddressHeaders: ["cf-connecting-ip"],
    },
  },
  emailAndPassword: {
    enabled: true,
  },
  user: {
    deleteUser: {
      enabled: true,
      beforeDelete: async (user) => {
        const db = getDb();
        await db
          .insert(schema.accountDeletionTable)
          .values({ userId: user.id })
          .onConflictDoNothing();

        // Scan the canonical room list as well as deleting the reverse index. Some rooms predate
        // membership tracking, and room state and D1 cannot be updated in one transaction.
        const rooms = await db.select({ roomId: schema.roomTable.id }).from(schema.roomTable);

        await Promise.all(
          rooms.map(({ roomId }) => {
            const durableObjectId = env.BIG_TWO_ROOM_DURABLE_OBJECT.idFromName(roomId);
            return env.BIG_TWO_ROOM_DURABLE_OBJECT.get(durableObjectId).redactPlayer(user.id);
          }),
        );

        await db
          .delete(schema.usersToRoomsTable)
          .where(eq(schema.usersToRoomsTable.userId, user.id));
      },
    },
  },
  plugins: [username()],
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
  },
});
