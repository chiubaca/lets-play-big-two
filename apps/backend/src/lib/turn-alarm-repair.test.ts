import Database from "better-sqlite3";
import { expect, it, vi } from "vite-plus/test";
import { repairTurnAlarms } from "./turn-alarm-repair";

it("repairs bounded pages fairly across scheduled runs without inventing Turns", async () => {
  const sqlite = new Database(":memory:");
  sqlite.exec(`CREATE TABLE room(id TEXT PRIMARY KEY, status TEXT);
    CREATE TABLE turnAlarmRepairCursor(id INTEGER PRIMARY KEY, after_room_id TEXT NOT NULL);
    INSERT INTO turnAlarmRepairCursor VALUES (1, '');`);
  const insert = sqlite.prepare("INSERT INTO room VALUES (?, 'playing')");
  for (let index = 0; index < 55; index++) insert.run(`R${String(index).padStart(4, "0")}`);
  const repaired = vi.fn(async (_roomId: string) => {});
  const env = {
    BIG_TWO_DB: {
      prepare(query: string) {
        let args: unknown[] = [];
        return {
          bind(...values: unknown[]) {
            args = values;
            return this;
          },
          first: async () => sqlite.prepare(query).get(...args) ?? null,
          all: async () => ({ results: sqlite.prepare(query).all(...args) }),
          run: async () => sqlite.prepare(query).run(...args),
        };
      },
    },
    BIG_TWO_ROOM_DURABLE_OBJECT: {
      getByName: (id: string) => ({ repairTurn: () => repaired(id) }),
    },
  } as unknown as Env;
  await repairTurnAlarms(env);
  expect(repaired).toHaveBeenCalledTimes(40);
  expect(repaired).toHaveBeenCalledWith("R0039");
  await repairTurnAlarms(env);
  expect(repaired).toHaveBeenCalledTimes(55);
  expect(repaired).toHaveBeenCalledWith("R0054");
  await repairTurnAlarms(env);
  expect(repaired).toHaveBeenCalledTimes(95);
  sqlite.close();
});
