import {
  bigTwoGameMachine,
  type BigTwoGameMachineSnapshot,
  type GameEvent,
} from "@big-two/game-state-machine";
import { createActor, type ActorRefFrom, type Subscription } from "xstate";
import {
  createPlayEvent,
  getLegalHint,
  getLocalSeats,
  getNextReadyPlayerId,
  getVisiblePlayerId,
  isGameTurnState,
  redactSnapshot,
  type OfflineGameConfig,
  type OfflineMode,
} from "./game-helpers";
import {
  getStorageKey,
  restoreGame,
  serializeGame,
  type LocalGameStorage,
} from "./game-persistence";
import { ensureGameRuntimeCompatibility } from "./native-runtime";

export const BOT_THINKING_DELAY_MS = 800;
type GameActor = ActorRefFrom<typeof bigTwoGameMachine>;

export interface OfflineGameView {
  snapshot: BigTwoGameMachineSnapshot | undefined;
  ready: boolean;
  error: string | null;
  handCounts: Record<string, number>;
  visiblePlayerId: string | undefined;
  handoffPlayerId: string | undefined;
  isBotTurn: boolean;
  thinkingPlayerId: string | undefined;
}

export function createInitialGameView(): OfflineGameView {
  return {
    snapshot: undefined,
    ready: false,
    error: null,
    handCounts: {},
    visiblePlayerId: undefined,
    handoffPlayerId: undefined,
    isBotTurn: false,
    thinkingPlayerId: undefined,
  };
}

// Serializing writes per key also prevents a remounted screen from loading behind a pending save.
const pendingWrites = new Map<string, Promise<void>>();

/** Owns the private machine; consumers and subscribers only receive the redacted view. */
export class OfflineGameSession {
  private actor: GameActor | undefined;
  private subscription: Subscription | undefined;
  private botTimer: ReturnType<typeof setTimeout> | undefined;
  private listeners = new Set<(view: OfflineGameView) => void>();
  private view = createInitialGameView();
  private readyPlayerId: string | undefined;
  private previousSnapshot: BigTwoGameMachineSnapshot | undefined;
  private disposed = false;
  private initializing = false;
  private active: boolean;

  constructor(
    readonly mode: OfflineMode,
    private readonly storage?: LocalGameStorage,
    active = true,
    private readonly config?: OfflineGameConfig,
  ) {
    this.active = active;
  }

  getView(): OfflineGameView {
    return this.view;
  }

  subscribe(listener: (view: OfflineGameView) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async initialize(): Promise<void> {
    if (this.disposed || this.initializing || this.actor) return;
    this.initializing = true;
    ensureGameRuntimeCompatibility();
    let savedSnapshot: BigTwoGameMachineSnapshot | undefined;
    const key = getStorageKey(this.mode);
    try {
      await pendingWrites.get(key);
      const saved = await this.storage?.getItem(key);
      if (saved) savedSnapshot = restoreGame(saved, this.mode, this.config);
    } catch {
      this.view = {
        ...this.view,
        error: "Could not restore your saved game. A new deal was started.",
      };
    }
    if (this.disposed) return;

    const actor = createActor(bigTwoGameMachine, savedSnapshot ? { snapshot: savedSnapshot } : {});
    this.actor = actor;
    this.subscription = actor.subscribe((snapshot) => {
      this.readyPlayerId = getNextReadyPlayerId(
        this.previousSnapshot,
        snapshot,
        this.readyPlayerId,
      );
      this.previousSnapshot = snapshot;
      this.publish();
      if (this.view.ready) this.persist(snapshot);
      this.scheduleBot();
    });
    actor.start();
    if (!savedSnapshot) {
      // Explicit JOIN_GAME IDs avoid the shared FILL_WITH_BOTS crypto.randomUUID dependency on Hermes.
      for (const seat of getLocalSeats(this.mode, this.config)) {
        actor.send({ type: "JOIN_GAME", playerId: seat.id, playerName: seat.name });
      }
      actor.send({ type: "START_GAME" });
    }
    this.view = { ...this.view, ready: true };
    this.publish();
    this.persist(actor.getSnapshot());
    this.scheduleBot();
  }

  send(event: GameEvent): void {
    if (!this.actor || !this.view.ready || this.disposed) return;
    if (event.type === "RESET_GAME") {
      this.reset();
      return;
    }
    // UI events may only act for the visible human; they cannot edit seats or peek through bots.
    if (
      !this.active ||
      !("playerId" in event) ||
      event.playerId !== this.view.visiblePlayerId ||
      this.view.isBotTurn ||
      !["PLAY_FIRST_MOVE", "PLAY_CARDS", "PLAY_NEW_ROUND_FIRST_MOVE", "PASS_TURN"].includes(
        event.type,
      )
    )
      return;
    const snapshot = this.actor.getSnapshot();
    if (snapshot.context.players[snapshot.context.currentPlayerIndex]?.id !== event.playerId)
      return;
    this.actor.send(event);
  }

  reset(): void {
    if (!this.actor || !this.view.ready || this.disposed) return;
    this.view = { ...this.view, error: null };
    this.cancelBot();
    this.readyPlayerId = undefined;
    this.actor.send({ type: "RESET_GAME" });
    this.actor.send({ type: "START_GAME" });
  }

  revealHand(): void {
    const snapshot = this.actor?.getSnapshot();
    if (
      this.disposed ||
      !this.active ||
      !this.view.ready ||
      this.mode !== "pass-and-play" ||
      !snapshot ||
      !isGameTurnState(snapshot.value) ||
      this.view.isBotTurn
    )
      return;
    this.readyPlayerId = snapshot.context.players[snapshot.context.currentPlayerIndex]?.id;
    this.publish();
  }

  requestHint(): ReturnType<typeof getLegalHint> {
    if (!this.view.ready || this.disposed || !this.view.snapshot || !this.view.visiblePlayerId)
      return null;
    return getLegalHint(this.view.snapshot, this.view.visiblePlayerId);
  }

  setActive(active: boolean): void {
    if (this.disposed || this.active === active) return;
    this.active = active;
    this.readyPlayerId = undefined;
    this.cancelBot();
    this.publish();
    this.scheduleBot();
  }

  dispose(): void {
    this.disposed = true;
    this.cancelBot();
    this.subscription?.unsubscribe();
    this.actor?.stop();
    this.actor = undefined;
    this.previousSnapshot = undefined;
    this.listeners.clear();
    this.view = createInitialGameView();
  }

  private publish(): void {
    if (this.disposed) return;
    const snapshot = this.actor?.getSnapshot();
    if (snapshot) {
      const current = snapshot.context.players[snapshot.context.currentPlayerIndex];
      const visiblePlayerId = getVisiblePlayerId(
        snapshot,
        this.mode,
        this.readyPlayerId,
        this.active,
        this.config,
      );
      const isBotTurn =
        isGameTurnState(snapshot.value) &&
        getLocalSeats(this.mode, this.config).some((seat) => seat.id === current?.id && seat.isBot);
      this.view = {
        ...this.view,
        snapshot: redactSnapshot(snapshot, this.mode, visiblePlayerId, this.config),
        handCounts: Object.fromEntries(
          snapshot.context.players.map((player) => [player.id, player.hand.length]),
        ),
        visiblePlayerId,
        handoffPlayerId:
          this.active &&
          this.mode === "pass-and-play" &&
          isGameTurnState(snapshot.value) &&
          !isBotTurn &&
          !visiblePlayerId
            ? current?.id
            : undefined,
        isBotTurn,
        thinkingPlayerId: this.view.ready && this.active && isBotTurn ? current?.id : undefined,
      };
    }
    for (const listener of this.listeners) listener(this.view);
  }

  private cancelBot(): void {
    if (this.botTimer !== undefined) clearTimeout(this.botTimer);
    this.botTimer = undefined;
  }

  private scheduleBot(): void {
    this.cancelBot();
    if (this.disposed || !this.active || !this.view.ready || !this.view.isBotTurn) return;
    const actor = this.actor;
    const expectedSnapshot = actor?.getSnapshot();
    this.botTimer = setTimeout(() => {
      this.botTimer = undefined;
      if (
        this.disposed ||
        !this.active ||
        !actor ||
        this.actor !== actor ||
        actor.getSnapshot() !== expectedSnapshot ||
        !expectedSnapshot
      )
        return;
      const player = expectedSnapshot.context.players[expectedSnapshot.context.currentPlayerIndex];
      const cards = getLegalHint(expectedSnapshot, player.id);
      const event = cards?.length
        ? createPlayEvent(expectedSnapshot, player.id, cards)
        : expectedSnapshot.value === "NEXT_PLAYER_TURN"
          ? { type: "PASS_TURN" as const, playerId: player.id }
          : undefined;
      if (event) actor.send(event);
    }, BOT_THINKING_DELAY_MS);
  }

  private persist(snapshot: BigTwoGameMachineSnapshot): void {
    const storage = this.storage;
    if (!storage || (!isGameTurnState(snapshot.value) && snapshot.value !== "GAME_END")) return;
    const key = getStorageKey(this.mode);
    const serialized = serializeGame(snapshot, this.mode, this.config);
    const write = (pendingWrites.get(key) ?? Promise.resolve())
      .then(() => storage.setItem(key, serialized))
      .catch(() => {
        if (!this.disposed) {
          this.view = { ...this.view, error: "Could not save this game on your device." };
          this.publish();
        }
      });
    pendingWrites.set(key, write);
    void write.then(() => {
      if (pendingWrites.get(key) === write) pendingWrites.delete(key);
    });
  }
}
