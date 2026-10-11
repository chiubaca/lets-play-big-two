import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { useTableAudio } from "./use-table-audio";
import type { TableAudioFrame } from "./table-sound-events";

const state = vi.hoisted(() => ({
  appState: "active",
  listeners: new Set<(value: string) => void>(),
  getItem: vi.fn<(key: string) => Promise<string | null>>(),
  setItem: vi.fn<(key: string, value: string) => Promise<void>>(),
  setAudioModeAsync: vi.fn<(mode: unknown) => Promise<void>>(),
  players: Array.from({ length: 8 }, () => ({
    isLoaded: true,
    currentStatus: { isLoaded: true, playbackState: "ready" },
    volume: 1,
    play: vi.fn(),
    pause: vi.fn(),
    seekTo: vi.fn<(position: number, before?: number, after?: number) => Promise<void>>(),
  })),
}));
vi.mock("react-native", () => ({
  AppState: {
    get currentState() {
      return state.appState;
    },
    addEventListener: (_event: string, listener: (value: string) => void) => {
      state.listeners.add(listener);
      return { remove: () => state.listeners.delete(listener) };
    },
  },
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: state.getItem, setItem: state.setItem },
}));
vi.mock("expo-audio", () => ({
  setAudioModeAsync: state.setAudioModeAsync,
  useAudioPlayer: (source: number) => state.players[source],
}));
vi.mock("./table-sounds", () => ({
  tablePlaySources: [2, 5, 6, 7],
  tableSounds: {
    select: { source: 0, volume: 0.22 },
    deselect: { source: 1, volume: 0.18 },
    play: { source: 2, volume: 0.38 },
    deal: { source: 3, volume: 0.28 },
    turn: { source: 4, volume: 0.32 },
  },
}));

let renderer: ReactTestRenderer;
let audio: ReturnType<typeof useTableAudio>;
const frame: TableAudioFrame = {
  identity: "room:ABCDE:host",
  ready: true,
  state: "NEXT_PLAYER_TURN",
  yourTurn: false,
  turnKey: "guest:1:0",
  pileLength: 1,
  lastPlayKey: "DIAMOND_3",
  lastPlaySize: 1,
};
const next: TableAudioFrame = {
  ...frame,
  yourTurn: true,
  turnKey: "host:2:0",
  pileLength: 2,
  lastPlayKey: "CLUB_4",
};
const placementIndexes = [2, 5, 6, 7];
const confirmedPlay = (pileLength: number): TableAudioFrame => ({
  ...frame,
  pileLength,
  lastPlayKey: `card:${pileLength}`,
  turnKey: `guest:${pileLength}:0`,
});
function Harness({ value }: { value: TableAudioFrame }) {
  audio = useTableAudio(value);
  return null;
}
const mount = async (value = frame) => {
  await act(async () => {
    renderer = create(createElement(Harness, { value }));
  });
};
const update = async (value: TableAudioFrame) => {
  await act(async () => renderer.update(createElement(Harness, { value })));
};
const advance = async (milliseconds: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
};
const appState = async (value: string) => {
  await act(async () => {
    state.appState = value;
    for (const listener of state.listeners) listener(value);
  });
};
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  state.appState = "active";
  state.getItem.mockResolvedValue(null);
  state.setItem.mockResolvedValue(undefined);
  state.setAudioModeAsync.mockResolvedValue(undefined);
  for (const player of state.players) {
    player.isLoaded = true;
    player.currentStatus = { isLoaded: true, playbackState: "ready" };
    player.seekTo.mockResolvedValue(undefined);
  }
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  state.listeners.clear();
  vi.resetAllMocks();
  vi.useRealTimers();
});

it("prepares quiet, foreground-only audio that respects silent mode and other apps", async () => {
  await mount();
  expect(audio.enabled).toBe(true);
  expect(audio.preferenceReady).toBe(true);
  expect(state.setAudioModeAsync).toHaveBeenCalledWith({
    allowsRecording: false,
    playsInSilentMode: false,
    shouldPlayInBackground: false,
    interruptionMode: "mixWithOthers",
  });
  expect(state.players.map((player) => player.volume)).toEqual([
    0.22, 0.18, 0.38, 0.28, 0.32, 0.38, 0.38, 0.38,
  ]);
  expect(state.players.every((player) => player.play.mock.calls.length === 0)).toBe(true);
});

it("restores a saved mute without leaking initial selection or turn audio", async () => {
  state.getItem.mockResolvedValue("false");
  await mount({ ...frame, yourTurn: true });
  await act(async () => audio.playSound("select"));
  expect(audio.enabled).toBe(false);
  expect(state.players[0].play).not.toHaveBeenCalled();
  expect(state.players[4].play).not.toHaveBeenCalled();
});

it("waits for the mute preference and does not queue historical cues", async () => {
  let resolve!: (value: string | null) => void;
  state.getItem.mockReturnValue(new Promise((done) => (resolve = done)));
  await mount();
  expect(audio.preferenceReady).toBe(false);
  await update(next);
  await act(async () => audio.playSound("select"));
  await act(async () => resolve(null));
  await advance(1000);
  expect(state.players.every((player) => player.play.mock.calls.length === 0)).toBe(true);
});

it("restarts a loaded selection sound from its beginning", async () => {
  await mount();
  await act(async () => audio.playSound("select"));
  await act(async () => audio.playSound("select"));
  expect(state.players[0].seekTo).toHaveBeenNthCalledWith(1, 0, 0, 0);
  expect(state.players[0].play).toHaveBeenCalledTimes(2);
});

it("replays every completed Android cue when only its status still reports loaded", async () => {
  await mount({ ...frame, yourTurn: true });
  const sounds = [
    [0, "select"],
    [1, "deselect"],
    [3, "deal"],
    [4, "turn"],
  ] as const;
  for (const [index, sound] of sounds) {
    await act(async () => audio.playSound(sound));
    const player = state.players[index];
    player.isLoaded = false;
    player.currentStatus = { isLoaded: true, playbackState: "ended" };
    await act(async () => audio.playSound(sound));
    expect(player.seekTo).toHaveBeenCalledTimes(2);
    expect(player.play).toHaveBeenCalledTimes(2);
  }
  for (let index = 0; index < 8; index++) {
    const player = state.players[placementIndexes[index % 4]];
    await act(async () => audio.playSound("play"));
    player.isLoaded = false;
    player.currentStatus = { isLoaded: true, playbackState: "ended" };
  }
  for (const index of placementIndexes) {
    expect(state.players[index].seekTo).toHaveBeenCalledTimes(2);
    expect(state.players[index].play).toHaveBeenCalledTimes(2);
  }
});

it("cycles four placement sounds on confirmed plays, wraps, and ignores rerenders", async () => {
  const order: number[] = [];
  for (const index of placementIndexes)
    state.players[index].play.mockImplementation(() => order.push(index));
  await mount();
  for (let pileLength = 2; pileLength <= 7; pileLength++) {
    await update(confirmedPlay(pileLength));
    await update({ ...confirmedPlay(pileLength) });
  }
  expect(order).toEqual([2, 5, 6, 7, 2, 5]);
});

it("does not advance the placement rotation for muted or disconnected snapshots", async () => {
  await mount();
  await update(confirmedPlay(2));
  await act(async () => audio.setSoundEnabled(false));
  await update(confirmedPlay(3));
  await act(async () => audio.setSoundEnabled(true));
  await update({ ...confirmedPlay(4), ready: false });
  await update(confirmedPlay(4));
  await update(confirmedPlay(5));
  expect(state.players[2].play).toHaveBeenCalledOnce();
  expect(state.players[5].play).toHaveBeenCalledOnce();
  expect(state.players[6].play).not.toHaveBeenCalled();
  expect(state.players[7].play).not.toHaveBeenCalled();
});

it("keeps the placement rotation through backgrounding without replaying missed plays", async () => {
  await mount();
  await update(confirmedPlay(2));
  await appState("background");
  await update(confirmedPlay(3));
  await appState("active");
  await update(confirmedPlay(4));
  expect(state.players[2].play).toHaveBeenCalledOnce();
  expect(state.players[5].play).toHaveBeenCalledOnce();
  expect(state.players[6].play).not.toHaveBeenCalled();
});

it("starts the placement rotation again when switching tables", async () => {
  await mount();
  await update(confirmedPlay(2));
  const identity = "room:FGHIJ:host";
  await update({ ...frame, identity });
  await update({ ...confirmedPlay(2), identity });
  expect(state.players[2].play).toHaveBeenCalledTimes(2);
  expect(state.players[5].play).not.toHaveBeenCalled();
});

it("does not advance the placement rotation after an unloaded source or failed seek", async () => {
  state.players[2].currentStatus.isLoaded = false;
  state.players[2].seekTo.mockRejectedValueOnce(new Error("Interrupted"));
  await mount();
  await update(confirmedPlay(2));
  state.players[2].currentStatus.isLoaded = true;
  await update(confirmedPlay(3));
  expect(state.players[2].play).not.toHaveBeenCalled();
  await update(confirmedPlay(4));
  await update(confirmedPlay(5));
  expect(state.players[2].play).toHaveBeenCalledOnce();
  expect(state.players[5].play).toHaveBeenCalledOnce();
});

it("drops an older pending placement when a newer confirmed play supersedes it", async () => {
  let resolve!: () => void;
  state.players[2].seekTo.mockReturnValueOnce(new Promise<void>((done) => (resolve = done)));
  await mount();
  await update(confirmedPlay(2));
  await update(confirmedPlay(3));
  await act(async () => resolve());
  expect(state.players[2].play).toHaveBeenCalledOnce();
  await update(confirmedPlay(4));
  expect(state.players[5].play).toHaveBeenCalledOnce();
});

it("cancels a pending placement on mute without consuming its rotation slot", async () => {
  let resolve!: () => void;
  state.players[2].seekTo.mockReturnValueOnce(new Promise<void>((done) => (resolve = done)));
  await mount();
  await update(confirmedPlay(2));
  await act(async () => audio.setSoundEnabled(false));
  await act(async () => resolve());
  expect(state.players[2].play).not.toHaveBeenCalled();
  expect(placementIndexes.every((index) => state.players[index].pause.mock.calls.length > 0)).toBe(
    true,
  );
  await act(async () => audio.setSoundEnabled(true));
  await update(confirmedPlay(3));
  expect(state.players[2].play).toHaveBeenCalledOnce();
  expect(state.players[5].play).not.toHaveBeenCalled();
});

it("pauses every placement variant before the next one and restores its volume", async () => {
  await mount();
  await update(confirmedPlay(2));
  for (const index of placementIndexes) state.players[index].pause.mockClear();
  state.players[5].volume = 1;
  await update(confirmedPlay(3));
  expect(placementIndexes.every((index) => state.players[index].pause.mock.calls.length > 0)).toBe(
    true,
  );
  expect(state.players[5].volume).toBe(0.38);
});

it("restores the quiet volume after asynchronous asset loading replaces the media", async () => {
  await mount();
  state.players[0].volume = 1;
  await act(async () => audio.playSound("select"));
  expect(state.players[0].volume).toBe(0.22);
  expect(state.players[0].play).toHaveBeenCalledOnce();
});

it("drops a slow selection seek when a newer deselection supersedes it", async () => {
  let resolve!: () => void;
  state.players[0].seekTo.mockReturnValue(new Promise<void>((done) => (resolve = done)));
  await mount();
  await act(async () => audio.playSound("select"));
  await act(async () => audio.playSound("deselect"));
  await act(async () => resolve());
  expect(state.players[0].play).not.toHaveBeenCalled();
  expect(state.players[1].play).toHaveBeenCalledOnce();
});

it("persists mute immediately and cancels both playing and pending sounds", async () => {
  let resolve!: () => void;
  state.players[0].seekTo.mockReturnValue(new Promise<void>((done) => (resolve = done)));
  await mount();
  await act(async () => audio.playSound("select"));
  await act(async () => audio.setSoundEnabled(false));
  await act(async () => resolve());
  expect(state.setItem).toHaveBeenCalledWith("big-two-native-sound-enabled", "false");
  expect(audio.enabled).toBe(false);
  expect(state.players.every((player) => player.pause.mock.calls.length > 0)).toBe(true);
  expect(state.players[0].play).not.toHaveBeenCalled();
});

it("does not play after a pending seek resolves following unmount", async () => {
  let resolve!: () => void;
  state.players[0].seekTo.mockReturnValue(new Promise<void>((done) => (resolve = done)));
  await mount();
  await act(async () => audio.playSound("select"));
  await act(async () => renderer.unmount());
  await act(async () => resolve());
  expect(state.players[0].play).not.toHaveBeenCalled();
  expect(state.listeners.size).toBe(0);
});

it("spaces the turn chime after a confirmed play and does not duplicate it on rerender", async () => {
  await mount();
  await update(next);
  expect(state.players[2].play).toHaveBeenCalledOnce();
  expect(state.players[4].play).not.toHaveBeenCalled();
  await update({ ...next });
  await advance(280);
  expect(state.players[4].play).toHaveBeenCalledOnce();
});

it("lets the deal cue finish before the first-turn chime", async () => {
  await mount({ ...frame, state: "WAITING_FOR_PLAYERS", pileLength: 0, lastPlayKey: "" });
  await update({ ...next, state: "ROUND_FIRST_MOVE", pileLength: 0, lastPlayKey: "" });
  expect(state.players[3].play).toHaveBeenCalledOnce();
  await advance(599);
  expect(state.players[4].play).not.toHaveBeenCalled();
  await advance(1);
  expect(state.players[4].play).toHaveBeenCalledOnce();
});

it("cancels an obsolete delayed turn cue when the next turn arrives", async () => {
  await mount();
  await update(next);
  await update({ ...next, yourTurn: false, turnKey: "guest:2:1" });
  await advance(1000);
  expect(state.players[4].play).not.toHaveBeenCalled();
});

it("drops a turn cue if its seek finishes after the human's turn has ended", async () => {
  let resolve!: () => void;
  state.players[4].seekTo.mockReturnValue(new Promise<void>((done) => (resolve = done)));
  await mount();
  const humanTurn = { ...frame, yourTurn: true, turnKey: "host:1:1" };
  await update(humanTurn);
  await update({ ...humanTurn, yourTurn: false, turnKey: "guest:1:2" });
  await act(async () => resolve());
  expect(state.players[4].play).not.toHaveBeenCalled();
});

it("does not play a missed turn cue after unmuting", async () => {
  await mount();
  await act(async () => audio.setSoundEnabled(false));
  await update(next);
  await act(async () => audio.setSoundEnabled(true));
  await advance(1000);
  expect(state.players[4].play).not.toHaveBeenCalled();
});

it("stops in the background and baselines snapshots again on foregrounding", async () => {
  await mount();
  await update(next);
  await appState("background");
  await update({ ...next, pileLength: 3, lastPlayKey: "new", turnKey: "host:3:0" });
  await appState("active");
  await advance(1000);
  expect(state.players[2].play).toHaveBeenCalledOnce();
  expect(state.players[4].play).not.toHaveBeenCalled();
});

it("silences disconnected and reconnected snapshots", async () => {
  await mount();
  await update({ ...frame, ready: false });
  await update({ ...next, ready: false });
  await update(next);
  await act(async () => audio.playSound("select"));
  expect(state.players[2].play).not.toHaveBeenCalled();
  expect(state.players[4].play).not.toHaveBeenCalled();
  expect(state.players[0].play).toHaveBeenCalledOnce();
});

it("treats audio/loading/storage failures as optional without breaking gameplay", async () => {
  state.getItem.mockRejectedValue(new Error("Storage unavailable"));
  state.setItem.mockRejectedValue(new Error("Storage unavailable"));
  state.players[0].isLoaded = false;
  state.players[0].currentStatus = { isLoaded: false, playbackState: "buffering" };
  state.players[1].seekTo.mockRejectedValue(new Error("Interrupted"));
  await mount();
  await act(async () => audio.playSound("select"));
  await act(async () => audio.playSound("deselect"));
  await act(async () => audio.setSoundEnabled(false));
  expect(audio.preferenceReady).toBe(true);
  expect(state.players[0].play).not.toHaveBeenCalled();
  expect(state.players[1].play).not.toHaveBeenCalled();
});

it("keeps gameplay silent if the device cannot configure the audio session", async () => {
  state.setAudioModeAsync.mockRejectedValue(new Error("Audio session unavailable"));
  await mount();
  await update(next);
  await act(async () => audio.playSound("select"));
  await advance(1000);
  expect(state.players.every((player) => player.play.mock.calls.length === 0)).toBe(true);
});
