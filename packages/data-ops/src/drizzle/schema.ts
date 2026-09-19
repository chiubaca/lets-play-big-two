import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid";

import { userTable } from "./auth-schema.ts";

export * from "./auth-schema.ts";

export const roomTable = sqliteTable("room", {
  id: text().primaryKey(),
  status: text(),
});

export const accountDeletionTable = sqliteTable("accountDeletion", {
  userId: text("user_id").primaryKey(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
});

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
