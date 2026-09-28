import Database from "better-sqlite3";
import { createActor } from "xstate";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { bigTwoGameMachine, type BigTwoGameMachineSnapshot } from "@big-two/game-state-machine";
import { BigTwoRoomObject } from "./big-two-room-do";

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
const REGISTRATION = { endpoint_id: ENDPOINT_ID, session_id: "ada-session", generation: 0 };

function room() {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const roomDb = new Database(":memory:");
  const accounts = new Database(":memory:");
  const actor = createActor(bigTwoGameMachine).start();
  actor.send({ type: "JOIN_GAME", playerId: "ada", playerName: "Ada" });
  actor.send({ type: "JOIN_GAME", playerId: "ben", playerName: "Ben" });
  roomDb.exec("CREATE TABLE game_room (id INTEGER PRIMARY KEY, game_state TEXT)");
  roomDb
    .prepare("INSERT INTO game_room VALUES (1, ?)")
    .run(JSON.stringify(actor.getPersistedSnapshot()));
  accounts.exec(`CREATE TABLE user (id TEXT PRIMARY KEY);
    CREATE TABLE session (id TEXT PRIMARY KEY, user_id TEXT, expires_at INTEGER);
    CREATE TABLE room (id TEXT PRIMARY KEY, status TEXT, expires_at INTEGER,
      created_at INTEGER, empty_since INTEGER, visited INTEGER);
    CREATE TABLE accountDeletion (user_id TEXT);
    CREATE TABLE turnNotificationPreference (user_id TEXT, enabled INTEGER, generation INTEGER);
    CREATE TABLE turnNotificationRegistration (endpoint_id TEXT PRIMARY KEY, endpoint TEXT,
      p256dh TEXT, auth TEXT, user_id TEXT, session_id TEXT, generation INTEGER);
    INSERT INTO user VALUES ('ada'), ('ben');
    INSERT INTO session VALUES ('ada-session','ada',1800000600000), ('ben-session','ben',1800000600000);
    INSERT INTO room VALUES ('ABCDE','waiting',NULL,1800000000000,NULL,1);
    INSERT INTO turnNotificationPreference VALUES ('ada',1,0), ('ben',1,0);`);
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
          else if (sql.startsWith("SELECT"))
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
      const key = id === "ada" ? ENDPOINT_ID : "b".repeat(64);
      accounts
        .prepare("INSERT INTO turnNotificationRegistration VALUES (?, ?, ?, ?, ?, ?, 0)")
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
    failEnrollmentRead: () => {
      failEnrollmentRead = true;
    },
    alarm: () => alarm,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
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
  const captured = r.outbox()[0] as { endpoint_id: string; session_id: string; generation: number };
  expect(await r.reload().verifyFirstTurn("ABCDE", turn.id, turn.recipient_id, captured)).toBe(
    true,
  );
  expect(
    await r.reload().verifyFirstTurn("ABCDE", crypto.randomUUID(), turn.recipient_id, captured),
  ).toBe(false);
  // A new registration cannot be admitted by the current state alone.
  expect(
    await r.reload().verifyFirstTurn("ABCDE", turn.id, turn.recipient_id, {
      endpoint_id: "c".repeat(64),
      session_id: captured.session_id,
      generation: 0,
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
  await r.reload().repairFirstTurn("ABCDE");
  expect(r.outbox()).toHaveLength(0);
});

it("never backfills a mid-Turn enrollment and retires pending work on the first play", async () => {
  const r = room();
  await r.object.gameAction({ type: "START_GAME" }, "ada", "ABCDE");
  const starter = r.snapshot().context.players[r.snapshot().context.currentPlayerIndex];
  const enrollment = r.enroll(starter.id);
  expect(r.outbox()).toHaveLength(0);
  expect(await r.object.verifyFirstTurn("ABCDE", r.firstTurn()!.id, starter.id, enrollment)).toBe(
    false,
  );
  await r
    .reload()
    .gameAction(
      { type: "PLAY_FIRST_MOVE", playerId: starter.id, cards: [{ value: "3", suit: "DIAMOND" }] },
      starter.id,
      "ABCDE",
    );
  expect(r.firstTurn()).toBeUndefined();
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
  await r.reload().repairFirstTurn("ABCDE");
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
  const delivery = r.outbox()[0] as { endpoint_id: string; session_id: string; generation: number };
  const push = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 201 }));
  const tab = crypto.randomUUID();
  await r.reload().setRoomFocus("ABCDE", turn.recipient_id, delivery.session_id, tab, true, 1);
  expect(await r.reload().verifyFirstTurn("ABCDE", turn.id, turn.recipient_id, delivery)).toBe(
    false,
  );
  await r.reload().alarm();
  expect(push).not.toHaveBeenCalled();
  expect(r.outbox()).toHaveLength(0);
  expect(
    await r.reload().setRoomFocus("ABCDE", turn.recipient_id, delivery.session_id, tab, false, 2),
  ).toBe(true);
  expect(r.outbox()).toHaveLength(0);
});

it("never sends when consent is revoked or the originating session expires after the deal", async () => {
  for (const revoke of ["consent", "session", "deletion", "room"] as const) {
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
    const push = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 201 }));
    await r.reload().alarm();
    expect(push).not.toHaveBeenCalled();
    expect(r.outbox()).toHaveLength(0);
    vi.restoreAllMocks();
  }
});

it("sends encrypted backend-only Web Push at most once after provider acceptance", async () => {
  const r = room();
  r.enroll("ada");
  r.enroll("ben");
  const signing = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  const privateKey = await crypto.subtle.exportKey("jwk", signing.privateKey);
  r.env.VAPID_PRIVATE_KEY = privateKey.d!;
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
  await r.object.gameAction({ type: "START_GAME" }, "ada", "ABCDE");
  const push = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 201 }));
  await r.reload().alarm();
  expect(push).toHaveBeenCalledTimes(1);
  const [, init] = push.mock.calls[0];
  expect(JSON.stringify(init)).not.toContain("It’s your turn");
  expect(r.outbox()).toMatchObject([{ status: "sent" }]);
  await r.reload().alarm();
  expect(push).toHaveBeenCalledTimes(1);
});
