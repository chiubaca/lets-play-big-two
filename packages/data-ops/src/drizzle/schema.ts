import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid";

import { userTable } from "./auth-schema.ts";

export * from "./auth-schema.ts";

export const roomTable = sqliteTable("room", {
  id: text().primaryKey(),
  status: text(),
});

export const usersToRoomsTable = sqliteTable("usersToRooms", {
  id: text()
    .primaryKey()
    .$defaultFn(() => nanoid()),
  userId: text("user_id")
    .notNull()
    .references(() => userTable.id),
  roomId: text("room_id")
    .notNull()
    .references(() => roomTable.id),
});
