import { describe, expect, it } from "vite-plus/test";
import { tableSoundEvents, type TableAudioFrame } from "./table-sound-events";

const frame = (changes: Partial<TableAudioFrame> = {}): TableAudioFrame => ({
  identity: "room:ABCDE:host",
  ready: true,
  state: "NEXT_PLAYER_TURN",
  yourTurn: false,
  turnKey: "guest:3:0",
  pileLength: 3,
  lastPlayKey: "HEART_10",
  lastPlaySize: 1,
  ...changes,
});

describe("native table sound events", () => {
  it("does not play historical cues on initial hydration", () => {
    expect(tableSoundEvents(undefined, frame({ yourTurn: true }))).toEqual([]);
  });

  it("plays one placement sound for a confirmed single or combination", () => {
    for (const size of [1, 2, 5])
      expect(
        tableSoundEvents(frame(), frame({ pileLength: 4, lastPlayKey: "new", lastPlaySize: size })),
      ).toEqual(["play"]);
  });

  it("keeps the final accepted play audible without a turn cue", () => {
    expect(
      tableSoundEvents(
        frame(),
        frame({ state: "GAME_END", pileLength: 4, lastPlayKey: "last-card" }),
      ),
    ).toEqual(["play"]);
  });

  it("does not repeat sounds for identical snapshots or rejected moves", () => {
    expect(tableSoundEvents(frame({ yourTurn: true }), frame({ yourTurn: true }))).toEqual([]);
  });

  it("plays a turn cue after a pass, not a card-placement sound", () => {
    expect(tableSoundEvents(frame(), frame({ yourTurn: true, turnKey: "host:3:1" }))).toEqual([
      "turn",
    ]);
  });

  it("plays placement then a turn cue when another player's play gives you the turn", () => {
    expect(
      tableSoundEvents(
        frame(),
        frame({ pileLength: 4, lastPlayKey: "new", yourTurn: true, turnKey: "host:4:0" }),
      ),
    ).toEqual(["play", "turn"]);
  });

  it("plays one deal cue after the waiting table receives a confirmed deal", () => {
    expect(
      tableSoundEvents(
        frame({ state: "WAITING_FOR_PLAYERS", pileLength: 0, lastPlayKey: "", lastPlaySize: 0 }),
        frame({
          state: "ROUND_FIRST_MOVE",
          pileLength: 0,
          lastPlayKey: "",
          lastPlaySize: 0,
          yourTurn: true,
          turnKey: "host:0:0",
        }),
      ),
    ).toEqual(["deal", "turn"]);
  });

  it.each(["NEXT_PLAYER_TURN", "GAME_END"])("recognizes a fresh deal after %s", (state) => {
    expect(
      tableSoundEvents(
        frame({ state }),
        frame({ state: "ROUND_FIRST_MOVE", pileLength: 0, lastPlayKey: "", lastPlaySize: 0 }),
      ),
    ).toEqual(["deal"]);
  });

  it.each([
    [frame({ ready: false }), frame({ yourTurn: true })],
    [frame(), frame({ ready: false, yourTurn: true })],
    [frame(), frame({ identity: "room:OTHER:host", yourTurn: true })],
    [frame(), frame({ identity: "room:ABCDE:guest", yourTurn: true })],
  ])("silences reconnect, background, and room/account changes", (before, current) => {
    expect(tableSoundEvents(before, current)).toEqual([]);
  });

  it("does not replay multiple skipped network plays", () => {
    expect(tableSoundEvents(frame(), frame({ pileLength: 6, lastPlayKey: "new" }))).toEqual([]);
  });

  it("does not cue a spectator's turn", () => {
    expect(tableSoundEvents(frame(), frame({ turnKey: "host:3:1", yourTurn: false }))).toEqual([]);
  });

  it("cues pass-and-play only when the human reveals their hand", () => {
    const hidden = frame({ identity: "pass-and-play", turnKey: "human-2:3:0" });
    expect(tableSoundEvents(hidden, { ...hidden, yourTurn: true })).toEqual(["turn"]);
  });
});
