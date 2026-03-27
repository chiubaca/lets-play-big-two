import { drizzle, type AnyD1Database } from "drizzle-orm/d1";

let db: ReturnType<typeof drizzle>;

export function initDatabase(bindingDb: AnyD1Database) {
  db = drizzle(bindingDb);
}

export function getDb() {
  if (!db) {
    throw new Error("Database not initialized");
  }
  return db;
}
