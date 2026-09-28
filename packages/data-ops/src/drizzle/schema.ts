import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid";

import { sessionTable, userTable } from "./auth-schema.ts";

export * from "./auth-schema.ts";

export const roomTable = sqliteTable("room", {
  id: text().primaryKey(),
  status: text(),
  createdAt: integer("created_at"),
  expiresAt: integer("expires_at"),
  emptySince: integer("empty_since"),
  visited: integer("visited").default(0).notNull(),
});

export const accountDeletionTable = sqliteTable("accountDeletion", {
  userId: text("user_id").primaryKey(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
});

export const turnNotificationPreferenceTable = sqliteTable("turnNotificationPreference", {
  userId: text("user_id")
    .primaryKey()
    .references(() => userTable.id, { onDelete: "cascade" }),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  generation: integer("generation").notNull().default(0),
});

export const turnNotificationRegistrationTable = sqliteTable(
  "turnNotificationRegistration",
  {
    endpointId: text("endpoint_id").primaryKey(),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    enrollmentId: text("enrollment_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessionTable.id, { onDelete: "cascade" }),
    generation: integer("generation").notNull(),
  },
  (table) => [index("turn_registration_user_idx").on(table.userId)],
);

export const usersToRoomsTable = sqliteTable(
  "usersToRooms",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id),
    roomId: text("room_id")
      .notNull()
      .references(() => roomTable.id),
  },
  (table) => [uniqueIndex("users_to_rooms_user_room_unique").on(table.userId, table.roomId)],
);
