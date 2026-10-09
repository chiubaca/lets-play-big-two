import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createActor } from "xstate";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { bigTwoGameMachine, type BigTwoGameMachineSnapshot } from "@big-two/game-state-machine";
import { BigTwoRoomObject } from "./big-two-room-do";
import { App } from "../hono/app";

let checkingAccount: string | null = null;
vi.mock("../lib/auth", () => ({
  auth: {
    api: {
      getSession: async () =>
        checkingAccount
          ? { user: { id: checkingAccount }, session: { id: `${checkingAccount}-session` } }
          : null,
    },
  },
}));

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    ctx: unknown;
    env: unknown;
    constructor(ctx: unknown, env: unknown) {
      this.ctx = ctx;
      this.env = env;
    }
  },
}));

const NOW = 1_800_000_000_000;
const ENDPOINT_ID = "a".repeat(64);
const REGISTRATION = {
  endpoint_id: ENDPOINT_ID,
  session_id: "ada-session",
  generation: 0,
  enrollment_id: "enrolled",
};

function room(playerCount = 2, legacyFocusSchema = false) {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const roomDb = new Database(":memory:");
  const accounts = new Database(":memory:");
  const actor = createActor(bigTwoGameMachine).start();
  actor.send({ type: "JOIN_GAME", playerId: "ada", playerName: "Ada" });
  actor.send({ type: "JOIN_GAME", playerId: "ben", playerName: "Ben" });
  if (playerCount === 3) actor.send({ type: "JOIN_GAME", playerId: "cal", playerName: "Cal" });
  roomDb.exec("CREATE TABLE game_room (id INTEGER PRIMARY KEY, game_state TEXT)");
  if (legacyFocusSchema) {
    roomDb.exec(`CREATE TABLE room_focus (
      tab_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, session_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    INSERT INTO room_focus VALUES ('old-tab', 'ada', 'ada-session', ${NOW + 10_000})`);
  }
  roomDb
    .prepare("INSERT INTO game_room VALUES (1, ?)")
    .run(JSON.stringify(actor.getPersistedSnapshot()));
  accounts.exec(`CREATE TABLE user (id TEXT PRIMARY KEY, emoji TEXT DEFAULT '♠️');
    CREATE TABLE session (id TEXT PRIMARY KEY, user_id TEXT, expires_at INTEGER);
    CREATE TABLE room (id TEXT PRIMARY KEY, status TEXT, expires_at INTEGER,
      created_at INTEGER, empty_since INTEGER, visited INTEGER);
    CREATE TABLE accountDeletion (user_id TEXT);
    CREATE TABLE turnNotificationPreference (user_id TEXT, enabled INTEGER, generation INTEGER);
    CREATE TABLE turnNotificationRegistration (endpoint_id TEXT PRIMARY KEY, endpoint TEXT,
      p256dh TEXT, auth TEXT, user_id TEXT, session_id TEXT, generation INTEGER,
      enrollment_id TEXT NOT NULL DEFAULT 'enrolled');
    INSERT INTO user (id) VALUES ('ada'), ('ben'), ('cal');
    INSERT INTO session VALUES ('ada-session','ada',1800000600000), ('ben-session','ben',1800000600000),
      ('ada-focus','ada',1800000600000), ('ben-focus','ben',1800000600000),
      ('cal-session','cal',1800000600000);
    INSERT INTO room VALUES ('ABCDE','waiting',NULL,1800000000000,NULL,1);
    INSERT INTO turnNotificationPreference VALUES ('ada',1,0), ('ben',1,0), ('cal',1,0);`);
  let failEnrollmentRead = false;
  const db = {
    prepare(sql: string) {
      let args: unknown[] = [];
      return {
        bind(...values: unknown[]) {
          args = values;
          return this;
        },
        first: async () => accounts.prepare(sql).get(...args) ?? null,
        all: async () => {
          if (failEnrollmentRead) throw new Error("account database unavailable");
          return { results: accounts.prepare(sql).all(...args) };
        },
        run: async () => accounts.prepare(sql).run(...args),
      };
    },
  };
  let alarm: number | null = null;
  let failAlarm = false;
  const ctx = {
    storage: {
      sql: {
        exec: (sql: string, ...values: unknown[]) => {
          if (sql.includes("CREATE TABLE")) roomDb.exec(sql);
          else if (sql.startsWith("SELECT") || sql.startsWith("PRAGMA"))
            return { toArray: () => roomDb.prepare(sql).all(...values) };
          else roomDb.prepare(sql).run(...values);
          return { toArray: () => [] };
        },
      },
      transactionSync: (fn: () => void) => roomDb.transaction(fn)(),
      getAlarm: async () => alarm,
      setAlarm: async (value: number) => {
        if (failAlarm) throw new Error("alarm offline");
        alarm = value;
      },
    },
    getWebSockets: () => [],
  } as unknown as DurableObjectState;
  const env = {
    BIG_TWO_DB: db,
    ROOM_CHAT_DURABLE_OBJECT: { getByName: () => ({ hasEligibleVisitors: async () => false }) },
    VAPID_SUBJECT: "mailto:test@example.com",
  } as unknown as Env;
  const object = new BigTwoRoomObject(ctx, env);
  return {
    object,
    accounts,
    roomDb,
    env,
    reload: () => new BigTwoRoomObject(ctx, env),
    enroll(id = "ada") {
      const key = id === "ada" ? ENDPOINT_ID : id === "ben" ? "b".repeat(64) : "c".repeat(64);
      accounts
        .prepare(
          "INSERT INTO turnNotificationRegistration (endpoint_id, endpoint, p256dh, auth, user_id, session_id, generation) VALUES (?, ?, ?, ?, ?, ?, 0)",
        )
        .run(
          key,
          "https://fcm.googleapis.com/fcm/send/example",
          "key",
          "auth",
          id,
          `${id}-session`,
        );
      return { ...REGISTRATION, endpoint_id: key, session_id: `${id}-session` };
    },
    firstTurn: () =>
      roomDb.prepare("SELECT * FROM first_turn").get() as
        | { id: string; recipient_id: string }
        | undefined,
    outbox: () => roomDb.prepare("SELECT * FROM turn_delivery").all(),
    snapshot: () =>
      JSON.parse(
        (roomDb.prepare("SELECT game_state FROM game_room").get() as { game_state: string })
          .game_state,
      ) as BigTwoGameMachineSnapshot,
    failAlarm: () => {
      failAlarm = true;
    },
    recoverAlarm: () => {
      failAlarm = false;
    },
    clearAlarm: () => {
      alarm = null;
    },
    failEnrollmentRead: () => {
      failEnrollmentRead = true;
    },
    alarm: () => alarm,
  };
}

async function enablePush(r: ReturnType<typeof room>) {
  const signing = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  r.env.VAPID_PRIVATE_KEY = (await crypto.subtle.exportKey("jwk", signing.privateKey)).d!;
  r.env.VAPID_PUBLIC_KEY = Buffer.from(
    await crypto.subtle.exportKey("raw", signing.publicKey),
  ).toString("base64url");
  const receiving = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ]);
  r.accounts
    .prepare("UPDATE turnNotificationRegistration SET p256dh = ?, auth = ?")
    .run(
      Buffer.from(await crypto.subtle.exportKey("raw", receiving.publicKey)).toString("base64url"),
      Buffer.alloc(16, 8).toString("base64url"),
    );
}

afterEach(() => {
  checkingAccount = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("upgrades an existing room focus table before accepting focus updates", async () => {
  const r = room(2, true);
  expect(
    r.roomDb.prepare("SELECT sequence, expires_at FROM room_focus WHERE tab_id = 'old-tab'").get(),
  ).toEqual({ sequence: 0, expires_at: NOW + 10_000 });
  const tab = crypto.randomUUID();
  expect(await r.object.setRoomFocus("ABCDE", "ada", "ada-session", tab, true, 1)).toBe(true);
  expect(await r.reload().setRoomFocus("ABCDE", "ada", "ada-session", tab, false, 2)).toBe(true);
  await r.reload().setRoomFocus("ABCDE", "ada", "ada-session", tab, true, 1);
  expect(
    r.roomDb.prepare("SELECT sequence, expires_at FROM room_focus WHERE tab_id = ?").get(tab),
  ).toEqual({ sequence: 2, expires_at: NOW - 1 });
});

it("commits a first Turn and only the already enrolled away Player's intent, across reload", async () => {
  const r = room();
  r.enroll("ada");
  r.enroll("ben");
  expect(await r.object.gameAction({ type: "START_GAME" }, "ada", "ABCDE")).toEqual({
    success: true,
  });
  const turn = r.firstTurn()!;
  expect(turn.recipient_id).toBe(
    r.snapshot().context.players[r.snapshot().context.currentPlayerIndex].id,
  );
  expect(r.outbox()).toHaveLength(1);
  expect(r.alarm()).toBe(NOW);
  const captured = r.outbox()[0] as typeof REGISTRATION;
  expect(await r.reload().verifyTurn("ABCDE", turn.id, turn.recipient_id, captured)).toBe(true);
  expect(
    await r.reload().verifyTurn("ABCDE", crypto.randomUUID(), turn.recipient_id, captured),
  ).toBe(false);
  // A new registration cannot be admitted by the current state alone.
  expect(
    await r.reload().verifyTurn("ABCDE", turn.id, turn.recipient_id, {
      endpoint_id: "c".repeat(64),
      session_id: captured.session_id,
      generation: 0,
      enrollment_id: captured.enrollment_id,
    }),
  ).toBe(false);
});

it("suppresses an intent while this room is focused on any tab, with no reminder after leaving", async () => {
  const r = room();
  r.enroll("ada");
  r.enroll("ben");
  const tab = crypto.randomUUID();
  // Both Players are focused; whichever has the opening Turn has affirmative presence.
  expect(await r.object.setRoomFocus("ABCDE", "ada", "ada-session", tab, true, 1)).toBe(true);
  expect(
    await r.object.setRoomFocus("ABCDE", "ben", "ben-session", crypto.randomUUID(), true, 1),
  ).toBe(true);
  expect(await r.object.gameAction({ type: "START_GAME" }, "ada", "ABCDE")).toEqual({
    success: true,
  });
  expect(r.firstTurn()).toBeTruthy();
  expect(r.outbox()).toHaveLength(0);
  expect(await r.reload().setRoomFocus("ABCDE", "ada", "ada-session", tab, false, 2)).toBe(true);
  // A delayed heartbeat must not revive a tab that has already blurred.
  await r.reload().setRoomFocus("ABCDE", "ada", "ada-session", tab, true, 1);
  await r.reload().repairTurn("ABCDE");
  expect(r.outbox()).toHaveLength(0);
});

it("does not let an expired focus session silence an enrolled install", async () => {
  const r = room();
  r.enroll("ada");
  r.enroll("ben");
  await r.object.setRoomFocus("ABCDE", "ada", "ada-focus", crypto.randomUUID(), true, 1);
  await r.object.setRoomFocus("ABCDE", "ben", "ben-focus", crypto.randomUUID(), true, 1);
  r.accounts
    .prepare("UPDATE session SET expires_at = ? WHERE id IN ('ada-focus','ben-focus')")
    .run(NOW);
  await r.object.gameAction({ type: "START_GAME" }, "ada", "ABCDE");
  expect(r.outbox()).toHaveLength(1);
  const turn = r.firstTurn()!;
  const captured = r.outbox()[0] as typeof REGISTRATION;
  expect(await r.reload().verifyTurn("ABCDE", turn.id, turn.recipient_id, captured)).toBe(true);
});

it("never backfills a mid-Turn enrollment and retires the old Turn on the first play", async () => {
  const r = room();
  await r.object.gameAction({ type: "START_GAME" }, "ada", "ABCDE");
  const starter = r.snapshot().context.players[r.snapshot().context.currentPlayerIndex];
  const turnId = r.firstTurn()!.id;
  const enrollment = r.enroll(starter.id);
  expect(r.outbox()).toHaveLength(0);
  expect(await r.object.verifyTurn("ABCDE", r.firstTurn()!.id, starter.id, enrollment)).toBe(false);
  await r
    .reload()
    .gameAction(
      { type: "PLAY_FIRST_MOVE", playerId: starter.id, cards: [{ value: "3", suit: "DIAMOND" }] },
      starter.id,
      "ABCDE",
    );
  expect(r.firstTurn()!.id).not.toBe(turnId);
  expect(r.outbox()).toHaveLength(0);
});

it("replaces persisted Turn identity and intents on plays, passes, and a return to the same lead", async () => {
  const r = room();
  r.enroll("ada");
  r.enroll("ben");
  await r.object.gameAction({ type: "START_GAME" }, "ada", "ABCDE");
  const opening = r.firstTurn()!;
  const starter = opening.recipient_id;
  const openingDelivery = r.outbox()[0] as typeof REGISTRATION;
  expect(await r.reload().verifyTurn("ABCDE", opening.id, starter, openingDelivery)).toBe(true);

  await r
    .reload()
    .gameAction(
      { type: "PLAY_FIRST_MOVE", playerId: starter, cards: [{ value: "3", suit: "DIAMOND" }] },
      starter,
      "ABCDE",
    );
  const follower = r.firstTurn()!;
  expect(follower.id).not.toBe(opening.id);
  expect(follower.recipient_id).not.toBe(starter);
  expect(r.outbox()).toMatchObject([{ turn_id: follower.id }]);
  expect(await r.reload().verifyTurn("ABCDE", opening.id, starter, openingDelivery)).toBe(false);
  expect(
    await r
      .reload()
      .gameAction(
        { type: "PLAY_CARDS", playerId: follower.recipient_id, cards: [] },
        follower.recipient_id,
        "ABCDE",
      ),
  ).toMatchObject({ success: false });
  expect(r.firstTurn()).toEqual(follower);
  expect(r.outbox()).toMatchObject([{ turn_id: follower.id }]);

  const followerDelivery = r.outbox()[0] as typeof REGISTRATION;
  await r
    .reload()
    .gameAction(
      { type: "PASS_TURN", playerId: follower.recipient_id },
      follower.recipient_id,
      "ABCDE",
    );
  expect(r.snapshot().value).toBe("PLAY_NEW_ROUND");
  const returned = r.firstTurn()!;
  expect(returned.recipient_id).toBe(starter);
  expect(returned.id).not.toBe(opening.id);
  expect(r.outbox()).toMatchObject([{ turn_id: returned.id }]);
  expect(
    await r.reload().verifyTurn("ABCDE", follower.id, follower.recipient_id, followerDelivery),
  ).toBe(false);

  const leadCard = r.snapshot().context.players.find((p) => p.id === starter)!.hand[0];
  await r
    .reload()
    .gameAction(
      { type: "PLAY_NEW_ROUND_FIRST_MOVE", playerId: starter, cards: [leadCard] },
      starter,
      "ABCDE",
    );
  const next = r.firstTurn()!;
  expect(next.id).not.toBe(returned.id);
  expect(next.recipient_id).not.toBe(starter);
  expect(r.outbox()).toMatchObject([{ turn_id: next.id }]);
});

it("creates a Turn for a follow play and for a non-final pass, then retires on a winning play", async () => {
  const r = room(3);
  for (const id of ["ada", "ben", "cal"]) r.enroll(id);
  await r.object.gameAction({ type: "START_GAME" }, "ada", "ABCDE");
  const starter = r.firstTurn()!.recipient_id;
  await r
    .reload()
    .gameAction(
      { type: "PLAY_FIRST_MOVE", playerId: starter, cards: [{ value: "3", suit: "DIAMOND" }] },
      starter,
      "ABCDE",
    );
  const follower = r.firstTurn()!;
  const card = r
    .snapshot()
    .context.players.find((p) => p.id === follower.recipient_id)!
    .hand.find((card) => card.value !== "3")!;
  expect(
    await r
      .reload()
      .gameAction(
        { type: "PLAY_CARDS", playerId: follower.recipient_id, cards: [card] },
        follower.recipient_id,
        "ABCDE",
      ),
  ).toEqual({ success: true });
  const third = r.firstTurn()!;
  expect(third.id).not.toBe(follower.id);
  expect(r.outbox()).toMatchObject([{ turn_id: third.id }]);
  await r
    .reload()
    .gameAction({ type: "PASS_TURN", playerId: third.recipient_id }, third.recipient_id, "ABCDE");
  const passed = r.firstTurn()!;
  expect(r.snapshot().value).toBe("NEXT_PLAYER_TURN");
  expect(passed.id).not.toBe(third.id);
  expect(r.outbox()).toMatchObject([{ turn_id: passed.id }]);

  // A legal last-card follow ends the game instead of starting another Turn.
  const state = r.snapshot();
  const winner = state.context.players[state.context.currentPlayerIndex];
  winner.hand = [{ value: "2", suit: "SPADE" }];
  state.context.cardPile = [[{ value: "3", suit: "DIAMOND" }]];
  state.context.roundMode = "single";
  r.roomDb.prepare("UPDATE game_room SET game_state = ? WHERE id = 1").run(JSON.stringify(state));
  expect(
    await r
      .reload()
      .gameAction(
        { type: "PLAY_CARDS", playerId: winner.id, cards: winner.hand },
        winner.id,
        "ABCDE",
      ),
  ).toEqual({ success: true });
  expect(r.snapshot().value).toBe("GAME_END");
  expect(r.firstTurn()).toBeUndefined();
  expect(r.outbox()).toHaveLength(0);
});

it("a fresh deal with the same starter gets another ID, while reset, restoration and re-entry do not", async () => {
  const r = room();
  r.enroll("ada");
  r.enroll("ben");
  await r.object.gameAction({ type: "START_GAME" }, "ada", "ABCDE");
  const first = r.firstTurn()!;
  const oldDelivery = r.outbox()[0] as typeof REGISTRATION;
  await r.reload().getRoomView("ada", "ABCDE");
  await r.reload().repairTurn("ABCDE");
  expect(r.firstTurn()).toEqual(first);
  expect(r.outbox()).toHaveLength(1);
  await r.reload().gameAction({ type: "RESET_GAME" }, "ada", "ABCDE");
  expect(r.firstTurn()).toBeUndefined();
  expect(r.outbox()).toHaveLength(0);
  expect(await r.reload().verifyTurn("ABCDE", first.id, first.recipient_id, oldDelivery)).toBe(
    false,
  );

  // Force the same starter independently of the shuffle: the identity must not use player index.
  const deal = vi.spyOn(Math, "random").mockReturnValue(0.5);
  await r.reload().gameAction({ type: "START_GAME" }, "ada", "ABCDE");
  const second = r.firstTurn()!;
  await r.reload().gameAction({ type: "RESET_GAME" }, "ada", "ABCDE");
  await r.reload().gameAction({ type: "START_GAME" }, "ada", "ABCDE");
  const third = r.firstTurn()!;
  deal.mockRestore();
  expect(third.recipient_id).toBe(second.recipient_id);
  expect(third.id).not.toBe(second.id);
  expect(r.outbox()).toMatchObject([{ turn_id: third.id }]);
});

it("does not create work for rejected or no-op actions, and never backfills after focus or enrollment changes", async () => {
  const r = room();
  r.enroll("ada");
  r.enroll("ben");
  const adaTab = crypto.randomUUID();
  const benTab = crypto.randomUUID();
  await r.object.setRoomFocus("ABCDE", "ada", "ada-session", adaTab, true, 1);
  await r.object.setRoomFocus("ABCDE", "ben", "ben-session", benTab, true, 1);
  await r.object.gameAction({ type: "START_GAME" }, "ada", "ABCDE");
  const first = r.firstTurn()!;
  expect(r.outbox()).toHaveLength(0);
  await r
    .reload()
    .setRoomFocus(
      "ABCDE",
      first.recipient_id,
      `${first.recipient_id}-session`,
      first.recipient_id === "ada" ? adaTab : benTab,
      false,
      2,
    );
  await r.reload().repairTurn("ABCDE");
  expect(r.outbox()).toHaveLength(0);
  expect(await r.reload().gameAction({ type: "START_GAME" }, "ada", "ABCDE")).toEqual({
    success: true,
  });
  expect(r.firstTurn()).toEqual(first);
  expect(r.outbox()).toHaveLength(0);
  const wrong = first.recipient_id === "ada" ? "ben" : "ada";
  expect(
    await r.reload().gameAction({ type: "PASS_TURN", playerId: wrong }, wrong, "ABCDE"),
  ).toEqual({ success: true });
  expect(r.firstTurn()).toEqual(first);
  expect(r.outbox()).toHaveLength(0);
});

it("restoring a room snapshot without a Turn row never reconstructs notification work", async () => {
  const r = room();
  r.enroll("ada");
  r.enroll("ben");
  await r.object.gameAction({ type: "START_GAME" }, "ada", "ABCDE");
  r.roomDb.exec("DELETE FROM turn_delivery; DELETE FROM first_turn");
  const restored = r.reload();
  await restored.getRoomView("ada", "ABCDE");
  await restored.repairTurn("ABCDE");
  await restored.alarm();
  expect(r.firstTurn()).toBeUndefined();
  expect(r.outbox()).toHaveLength(0);
});

it("reconnecting and re-entering the room preserves the Turn instead of scheduling another alert", async () => {
  const r = room();
  r.enroll("ada");
  r.enroll("ben");
  await r.object.gameAction({ type: "START_GAME" }, "ada", "ABCDE");
  const turn = r.firstTurn()!;
  const delivery = r.outbox()[0] as typeof REGISTRATION;
  const restored = r.reload();
  expect(
    await restored.markConnected("ABCDE", turn.recipient_id, `${turn.recipient_id}-session`),
  ).toBe(true);
  expect(await restored.getRoomView(turn.recipient_id, "ABCDE")).toBeTruthy();
  const tab = crypto.randomUUID();
  expect(
    await restored.setRoomFocus(
      "ABCDE",
      turn.recipient_id,
      `${turn.recipient_id}-session`,
      tab,
      true,
      1,
    ),
  ).toBe(true);
  expect(r.firstTurn()).toEqual(turn);
  expect(r.outbox()).toHaveLength(1);
  await restored.alarm();
  expect(r.outbox()).toHaveLength(0);
  await r
    .reload()
    .setRoomFocus("ABCDE", turn.recipient_id, `${turn.recipient_id}-session`, tab, false, 2);
  await r.reload().repairTurn("ABCDE");
  expect(r.firstTurn()).toEqual(turn);
  expect(r.outbox()).toHaveLength(0);
  expect(await r.reload().verifyTurn("ABCDE", turn.id, turn.recipient_id, delivery)).toBe(false);
});

it("does not backfill consent added during a Turn, but captures it on the next accepted action", async () => {
  const r = room();
  r.enroll("ada");
  r.enroll("ben");
  r.accounts.prepare("UPDATE turnNotificationPreference SET enabled = 0").run();
  await r.object.gameAction({ type: "START_GAME" }, "ada", "ABCDE");
  const opening = r.firstTurn()!;
  r.accounts.prepare("UPDATE turnNotificationPreference SET enabled = 1").run();
  await r.reload().repairTurn("ABCDE");
  expect(r.outbox()).toHaveLength(0);
  expect(
    await r.reload().verifyTurn("ABCDE", opening.id, opening.recipient_id, {
      ...REGISTRATION,
      endpoint_id: opening.recipient_id === "ada" ? ENDPOINT_ID : "b".repeat(64),
      session_id: `${opening.recipient_id}-session`,
    }),
  ).toBe(false);
  await r.reload().gameAction(
    {
      type: "PLAY_FIRST_MOVE",
      playerId: opening.recipient_id,
      cards: [{ value: "3", suit: "DIAMOND" }],
    },
    opening.recipient_id,
    "ABCDE",
  );
  expect(r.outbox()).toMatchObject([{ turn_id: r.firstTurn()!.id }]);
});

it("suppressing a later Turn by focus cannot turn into a reminder on departure", async () => {
  const r = room();
  r.enroll("ada");
  r.enroll("ben");
  await r.object.gameAction({ type: "START_GAME" }, "ada", "ABCDE");
  const starter = r.firstTurn()!.recipient_id;
  const follower = starter === "ada" ? "ben" : "ada";
  const tab = crypto.randomUUID();
  await r.reload().setRoomFocus("ABCDE", follower, `${follower}-session`, tab, true, 1);
  await r
    .reload()
    .gameAction(
      { type: "PLAY_FIRST_MOVE", playerId: starter, cards: [{ value: "3", suit: "DIAMOND" }] },
      starter,
      "ABCDE",
    );
  const turn = r.firstTurn()!;
  expect(turn.recipient_id).toBe(follower);
  expect(r.outbox()).toHaveLength(0);
  await r.reload().setRoomFocus("ABCDE", follower, `${follower}-session`, tab, false, 2);
  await r.reload().repairTurn("ABCDE");
  expect(r.outbox()).toHaveLength(0);
});

it("keeps an accepted deal successful when alarm scheduling fails; repair wakes its committed intent", async () => {
  const r = room();
  r.enroll("ada");
  r.enroll("ben");
  r.failAlarm();
  vi.spyOn(console, "error").mockImplementation(() => {});
  expect(await r.object.gameAction({ type: "START_GAME" }, "ada", "ABCDE")).toEqual({
    success: true,
  });
  expect(r.snapshot().value).toBe("ROUND_FIRST_MOVE");
  expect(r.outbox()).toHaveLength(1);
  r.recoverAlarm();
  await r.reload().repairTurn("ABCDE");
  expect(r.alarm()).toBe(NOW);
});

it("commits the deal without an intent when account eligibility cannot be verified", async () => {
  const r = room();
  r.enroll("ada");
  r.enroll("ben");
  r.failEnrollmentRead();
  expect(await r.object.gameAction({ type: "START_GAME" }, "ada", "ABCDE")).toEqual({
    success: true,
  });
  expect(r.snapshot().value).toBe("ROUND_FIRST_MOVE");
  expect(r.outbox()).toHaveLength(0);
});

it("rechecks consent, session, room and focus before delivery, then retires ineligible work", async () => {
  const r = room();
  r.enroll("ada");
  r.enroll("ben");
  await r.object.gameAction({ type: "START_GAME" }, "ada", "ABCDE");
  const turn = r.firstTurn()!;
  const delivery = r.outbox()[0] as typeof REGISTRATION;
  const push = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 201 }));
  const tab = crypto.randomUUID();
  await r.reload().setRoomFocus("ABCDE", turn.recipient_id, delivery.session_id, tab, true, 1);
  expect(await r.reload().verifyTurn("ABCDE", turn.id, turn.recipient_id, delivery)).toBe(false);
  await r.reload().alarm();
  expect(push).not.toHaveBeenCalled();
  expect(r.outbox()).toHaveLength(0);
  expect(
    await r.reload().setRoomFocus("ABCDE", turn.recipient_id, delivery.session_id, tab, false, 2),
  ).toBe(true);
  expect(r.outbox()).toHaveLength(0);
});

it("never sends when consent is revoked or the originating session expires after the deal", async () => {
  for (const revoke of [
    "consent",
    "session",
    "deletion",
    "room",
    "registration",
    "generation",
  ] as const) {
    const r = room();
    r.enroll("ada");
    r.enroll("ben");
    await r.object.gameAction({ type: "START_GAME" }, "ada", "ABCDE");
    const turn = r.firstTurn()!;
    if (revoke === "consent")
      r.accounts
        .prepare("UPDATE turnNotificationPreference SET enabled = 0 WHERE user_id = ?")
        .run(turn.recipient_id);
    if (revoke === "session")
      r.accounts
        .prepare("UPDATE session SET expires_at = ? WHERE user_id = ?")
        .run(NOW, turn.recipient_id);
    if (revoke === "deletion")
      r.accounts.prepare("INSERT INTO accountDeletion VALUES (?)").run(turn.recipient_id);
    if (revoke === "room") r.accounts.prepare("UPDATE room SET status = 'expiring'").run();
    if (revoke === "registration")
      r.accounts
        .prepare("DELETE FROM turnNotificationRegistration WHERE user_id = ?")
        .run(turn.recipient_id);
    if (revoke === "generation")
      r.accounts
        .prepare(
          "UPDATE turnNotificationPreference SET generation = generation + 1 WHERE user_id = ?",
        )
        .run(turn.recipient_id);
    const push = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 201 }));
    await r.reload().alarm();
    expect(push).not.toHaveBeenCalled();
    expect(r.outbox()).toHaveLength(0);
    vi.restoreAllMocks();
  }
});

it("never revives queued work after removal and explicit re-enrollment of the same install", async () => {
  const r = room();
  r.enroll("ada");
  r.enroll("ben");
  await r.object.gameAction({ type: "START_GAME" }, "ada", "ABCDE");
  const turn = r.firstTurn()!;
  const delivery = r.outbox()[0] as typeof REGISTRATION;
  r.accounts
    .prepare("DELETE FROM turnNotificationRegistration WHERE endpoint_id = ?")
    .run(delivery.endpoint_id);
  r.accounts
    .prepare("INSERT INTO turnNotificationRegistration VALUES (?, ?, ?, ?, ?, ?, 0, ?)")
    .run(
      delivery.endpoint_id,
      "https://fcm.googleapis.com/fcm/send/example",
      "key",
      "auth",
      turn.recipient_id,
      delivery.session_id,
      "new-enrollment",
    );
  expect(await r.reload().verifyTurn("ABCDE", turn.id, turn.recipient_id, delivery)).toBe(false);
  const push = vi.spyOn(globalThis, "fetch");
  await r.reload().alarm();
  expect(push).not.toHaveBeenCalled();
  expect(r.outbox()).toHaveLength(0);
});

it("upgrades legacy room queues without treating old intents as new enrollments", async () => {
  const r = room();
  r.roomDb.exec(`DROP TABLE turn_delivery;
    CREATE TABLE turn_delivery (turn_id TEXT, endpoint_id TEXT, session_id TEXT,
      generation INTEGER, attempts INTEGER DEFAULT 0, next_at INTEGER,
      status TEXT DEFAULT 'pending', PRIMARY KEY (turn_id, endpoint_id));`);
  r.enroll("ada");
  r.enroll("ben");
  await r.reload().gameAction({ type: "START_GAME" }, "ada", "ABCDE");
  expect(r.outbox()).toMatchObject([{ enrollment_id: "enrolled" }]);
});

it("does not send when deletion starts while an eligible push is being encrypted", async () => {
  const r = room();
  r.enroll("ada");
  r.enroll("ben");
  await enablePush(r);
  await r.object.gameAction({ type: "START_GAME" }, "ada", "ABCDE");
  const turn = r.firstTurn()!;
  const push = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 201 }));
  // The first eligibility read succeeds; deletion is committed before the push can leave the Worker.
  const db = r.env.BIG_TWO_DB;
  const original = db.prepare.bind(db);
  const prepare = vi.spyOn(db, "prepare");
  let reads = 0;
  prepare.mockImplementation((sql: string) => {
    if (sql.includes("SELECT r.endpoint_id, r.endpoint, r.p256dh")) {
      reads++;
      if (reads === 3)
        r.accounts.prepare("INSERT INTO accountDeletion VALUES (?)").run(turn.recipient_id);
    }
    return original(sql);
  });
  await r.reload().alarm();
  expect(push).not.toHaveBeenCalled();
  expect(r.outbox()).toHaveLength(0);
});

it("sends encrypted backend-only Web Push at most once after provider acceptance", async () => {
  const r = room();
  r.enroll("ada");
  r.enroll("ben");
  await enablePush(r);
  await r.object.gameAction({ type: "START_GAME" }, "ada", "ABCDE");
  const push = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 201 }));
  const draining = r.reload();
  await Promise.all([draining.alarm(), draining.alarm()]);
  expect(push).toHaveBeenCalledTimes(1);
  const [, init] = push.mock.calls[0];
  expect(JSON.stringify(init)).not.toContain("It’s your turn");
  expect(r.outbox()).toMatchObject([{ status: "sent" }]);
  await r.reload().alarm();
  expect(push).toHaveBeenCalledTimes(1);
});

it("sends an Expo alert when a native player backgrounds after playing and the next player returns the turn", async () => {
  const r = room();
  r.enroll("ada");
  r.enroll("ben");
  r.accounts
    .prepare(
      "UPDATE turnNotificationRegistration SET endpoint = 'expo:ExpoPushToken[' || user_id || '-device]', p256dh = '', auth = ''",
    )
    .run();
  r.accounts.exec(
    readFileSync(
      new URL("../../drizzle/migrations/0010_turn_push_receipts.sql", import.meta.url),
      "utf8",
    ),
  );
  r.env.VAPID_PRIVATE_KEY = "ticket-secret";
  const tabs = { ada: crypto.randomUUID(), ben: crypto.randomUUID() };
  for (const player of ["ada", "ben"] as const)
    await r.object.setRoomFocus("ABCDE", player, `${player}-session`, tabs[player], true, 1);
  await r.object.gameAction({ type: "START_GAME" }, "ada", "ABCDE");
  const starter = r.firstTurn()!.recipient_id as "ada" | "ben";
  await r.object.gameAction(
    { type: "PLAY_FIRST_MOVE", playerId: starter, cards: [{ value: "3", suit: "DIAMOND" }] },
    starter,
    "ABCDE",
  );
  await r.object.setRoomFocus("ABCDE", starter, `${starter}-session`, tabs[starter], false, 2);
  const follower = r.firstTurn()!.recipient_id;
  const push = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(Response.json({ data: { status: "ok", id: "native-turn-receipt" } }));
  await r.object.gameAction({ type: "PASS_TURN", playerId: follower }, follower, "ABCDE");
  await r.reload().alarm();
  expect(push).toHaveBeenCalledOnce();
  expect(push.mock.calls[0][0]).toBe("https://exp.host/--/api/v2/push/send");
  const payload = JSON.parse(push.mock.calls[0][1]!.body as string);
  expect(payload.data).toMatchObject({ roomId: "ABCDE", turnId: r.firstTurn()!.id });
  expect(r.outbox()).toMatchObject([{ status: "sent" }]);
});

it("tracks two installs independently across provider failure, alarm repair, and reload", async () => {
  const r = room();
  for (const user of ["ada", "ben"]) {
    for (const install of ["first", "second"]) {
      const endpoint = `https://fcm.googleapis.com/fcm/send/${user}-${install}`;
      const endpointId = createHash("sha256").update(endpoint).digest("hex");
      r.accounts
        .prepare(
          "INSERT INTO turnNotificationRegistration (endpoint_id, endpoint, p256dh, auth, user_id, session_id, generation) VALUES (?, ?, ?, ?, ?, ?, 0)",
        )
        .run(endpointId, endpoint, "key", "auth", user, `${user}-session`);
    }
  }
  await enablePush(r);
  expect(await r.object.gameAction({ type: "START_GAME" }, "ada", "ABCDE")).toEqual({
    success: true,
  });
  expect(r.outbox()).toHaveLength(2);
  const push = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(null, { status: 201 }))
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValue(new Response(null, { status: 201 }));
  await r.reload().alarm();
  expect(r.outbox()).toMatchObject([
    { status: "sent" },
    { status: "pending", attempts: 1, next_at: NOW + 15_000 },
  ]);
  r.clearAlarm();
  await r.reload().repairTurn("ABCDE");
  expect(r.alarm()).toBe(NOW + 15_000);
  vi.setSystemTime(NOW + 15_000);
  await r.reload().alarm();
  await r.reload().alarm();
  expect(push).toHaveBeenCalledTimes(3);
  expect(r.outbox()).toMatchObject([{ status: "sent" }, { status: "sent" }]);
});

it("authenticates a worker check against the persisted per-install Turn intent", async () => {
  const r = room();
  r.enroll("ada");
  r.enroll("ben");
  r.env.VAPID_PRIVATE_KEY = "ticket-signing-secret";
  await r.object.gameAction({ type: "START_GAME" }, "ada", "ABCDE");
  const turn = r.firstTurn()!;
  const [{ endpoint_id: endpointId }] = r.outbox() as { endpoint_id: string }[];
  r.env.BIG_TWO_ROOM_DURABLE_OBJECT = {
    getByName: () => r.reload(),
  } as unknown as Env["BIG_TWO_ROOM_DURABLE_OBJECT"];
  const check = () =>
    App.request(
      `/api/turn-notifications/check?roomId=ABCDE&turnId=${turn.id}&endpointId=${endpointId}`,
      {},
      r.env,
    );
  checkingAccount = turn.recipient_id;
  expect(await (await check()).json()).toMatchObject({ eligible: true });
  checkingAccount = turn.recipient_id === "ada" ? "ben" : "ada";
  expect(await (await check()).json()).toEqual({ eligible: false });
  checkingAccount = turn.recipient_id;
  r.accounts
    .prepare("UPDATE turnNotificationPreference SET enabled = 0 WHERE user_id = ?")
    .run(checkingAccount);
  expect(await (await check()).json()).toEqual({ eligible: false });
  r.accounts
    .prepare("UPDATE turnNotificationPreference SET enabled = 1 WHERE user_id = ?")
    .run(checkingAccount);
  vi.setSystemTime(NOW + 5 * 60_000);
  expect(await (await check()).json()).toEqual({ eligible: false });
});

it("retires invalid endpoints without retrying and bounds unavailable-provider retries before deadline", async () => {
  const r = room();
  r.enroll("ada");
  r.enroll("ben");
  await enablePush(r);
  await r.object.gameAction({ type: "START_GAME" }, "ada", "ABCDE");
  const push = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 410 }));
  await r.reload().alarm();
  expect(r.outbox()).toHaveLength(0);
  expect(
    r.accounts
      .prepare("SELECT * FROM turnNotificationRegistration WHERE user_id = ?")
      .all(r.firstTurn()!.recipient_id),
  ).toHaveLength(0);
  await r.reload().alarm();
  expect(push).toHaveBeenCalledTimes(1);

  const s = room();
  s.enroll("ada");
  s.enroll("ben");
  await s.object.gameAction({ type: "START_GAME" }, "ada", "ABCDE");
  expect(s.outbox()).toHaveLength(1);
  // Missing VAPID keys are a transient service outage; retries are still bounded.
  for (const time of [NOW, NOW + 15_000, NOW + 45_000]) {
    vi.setSystemTime(time);
    await s.reload().alarm();
  }
  expect(s.outbox()).toHaveLength(0);
});

it("does not delete a newly enrolled install when an older provider request returns 410", async () => {
  const r = room();
  r.enroll("ada");
  r.enroll("ben");
  await enablePush(r);
  await r.object.gameAction({ type: "START_GAME" }, "ada", "ABCDE");
  const delivery = r.outbox()[0] as typeof REGISTRATION;
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    r.accounts
      .prepare("UPDATE turnNotificationRegistration SET enrollment_id = ? WHERE endpoint_id = ?")
      .run("replacement", delivery.endpoint_id);
    return new Response(null, { status: 410 });
  });
  await r.reload().alarm();
  expect(
    r.accounts
      .prepare("SELECT enrollment_id FROM turnNotificationRegistration WHERE endpoint_id = ?")
      .get(delivery.endpoint_id),
  ).toEqual({ enrollment_id: "replacement" });
  expect(r.outbox()).toHaveLength(0);
});

it("drains at most four installs per alarm and retires permanent provider failures", async () => {
  const r = room();
  r.enroll("ada");
  r.enroll("ben");
  for (const [user, ids] of [
    ["ada", "cdefg"],
    ["ben", "hijkl"],
  ] as const) {
    for (const id of ids) {
      r.accounts
        .prepare(
          "INSERT INTO turnNotificationRegistration (endpoint_id, endpoint, p256dh, auth, user_id, session_id, generation) VALUES (?, ?, ?, ?, ?, ?, 0)",
        )
        .run(
          id.repeat(64),
          `https://fcm.googleapis.com/fcm/send/${id}`,
          "key",
          "auth",
          user,
          `${user}-session`,
        );
    }
  }
  await enablePush(r);
  await r.object.gameAction({ type: "START_GAME" }, "ada", "ABCDE");
  const count = r.outbox().length;
  expect(count).toBe(6);
  const push = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 400 }));
  await r.reload().alarm();
  expect(push).toHaveBeenCalledTimes(Math.min(4, count));
  expect(r.outbox()).toHaveLength(Math.max(0, count - 4));
  await r.reload().alarm();
  expect(push).toHaveBeenCalledTimes(count);
  expect(r.outbox()).toHaveLength(0);
  expect(
    r.accounts.prepare("SELECT count(*) AS count FROM turnNotificationRegistration").get(),
  ).toMatchObject({ count: 12 }); // 400 is permanent for this Turn, not a dead subscription.
});

it("bounds retries for provider network failures while preserving an accepted action", async () => {
  const r = room();
  r.enroll("ada");
  r.enroll("ben");
  await enablePush(r);
  expect(await r.object.gameAction({ type: "START_GAME" }, "ada", "ABCDE")).toEqual({
    success: true,
  });
  const push = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("provider offline"));
  for (const time of [NOW, NOW + 15_000, NOW + 45_000]) {
    vi.setSystemTime(time);
    await r.reload().alarm();
  }
  expect(push).toHaveBeenCalledTimes(3);
  expect(r.outbox()).toHaveLength(0);
});

it("does not retry a provider failure after the Turn ends", async () => {
  const r = room();
  r.enroll("ada");
  r.enroll("ben");
  await enablePush(r);
  await r.object.gameAction({ type: "START_GAME" }, "ada", "ABCDE");
  const push = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 503 }));
  await r.reload().alarm();
  expect(r.outbox()).toMatchObject([{ attempts: 1, status: "pending" }]);
  expect(await r.reload().gameAction({ type: "RESET_GAME" }, "ada", "ABCDE")).toEqual({
    success: true,
  });
  vi.setSystemTime(NOW + 15_000);
  await r.reload().alarm();
  expect(push).toHaveBeenCalledTimes(1);
  expect(r.outbox()).toHaveLength(0);
});

it("serializes redaction with an in-flight alarm so it cannot retire a Turn before a send", async () => {
  const r = room();
  r.enroll("ada");
  r.enroll("ben");
  await enablePush(r);
  await r.object.gameAction({ type: "START_GAME" }, "ada", "ABCDE");
  const turn = r.firstTurn()!;
  let finishSend!: (response: Response) => void;
  const push = vi.spyOn(globalThis, "fetch").mockImplementation(
    () =>
      new Promise<Response>((resolve) => {
        finishSend = resolve;
      }),
  );
  const draining = r.object.alarm();
  await vi.waitFor(() => expect(push).toHaveBeenCalledTimes(1));
  const redacting = r.object.redactPlayer(turn.recipient_id);
  expect(r.firstTurn()).toEqual(turn);
  finishSend(new Response(null, { status: 201 }));
  await draining;
  await redacting;
  expect(r.firstTurn()).toBeUndefined();
  expect(r.outbox()).toHaveLength(0);
  await r.object.alarm();
  expect(push).toHaveBeenCalledTimes(1);
});

it("never schedules or sends a retry beyond the original Turn deadline", async () => {
  const r = room();
  r.enroll("ada");
  r.enroll("ben");
  await r.object.gameAction({ type: "START_GAME" }, "ada", "ABCDE");
  const deadline = NOW + 5 * 60_000;
  vi.setSystemTime(deadline - 1000);
  await r.reload().alarm(); // unavailable provider, next retry would be after deadline
  expect(r.outbox()).toHaveLength(0);
  r.clearAlarm();
  await r.reload().repairTurn("ABCDE");
  expect(r.alarm()).toBeNull();
  vi.setSystemTime(deadline);
  await r.reload().alarm();
  expect(r.outbox()).toHaveLength(0);
});

it("bounds a delayed provider request to the remaining Turn lifetime", async () => {
  const r = room();
  r.enroll("ada");
  r.enroll("ben");
  await enablePush(r);
  await r.object.gameAction({ type: "START_GAME" }, "ada", "ABCDE");
  const deadline = NOW + 5 * 60_000;
  vi.setSystemTime(deadline - 750);
  const timeout = vi.spyOn(AbortSignal, "timeout");
  let finishSend!: (response: Response) => void;
  const push = vi.spyOn(globalThis, "fetch").mockImplementation(
    () =>
      new Promise<Response>((resolve) => {
        finishSend = resolve;
      }),
  );
  const draining = r.reload().alarm();
  await vi.waitFor(() => expect(push).toHaveBeenCalledTimes(1));
  expect(push).toHaveBeenCalledTimes(1);
  const timeoutMs = timeout.mock.calls[0][0];
  expect(timeoutMs).toBeGreaterThan(0);
  expect(timeoutMs).toBeLessThanOrEqual(750);
  expect((push.mock.calls[0][1] as RequestInit).signal).toBeInstanceOf(AbortSignal);
  expect(new Headers(push.mock.calls[0][1]?.headers).get("TTL")).toBe("0");
  vi.setSystemTime(deadline);
  finishSend(new Response(null, { status: 503 }));
  await draining;
  expect(r.outbox()).toHaveLength(0);
  await r.reload().alarm();
  expect(push).toHaveBeenCalledTimes(1);
});
