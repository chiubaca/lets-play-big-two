import { describe, expect, it } from "vite-plus/test";
import { tableSeats } from "./table-seats";

describe("table seats", () => {
  const players = [0, 1, 2, 3].map((index) => ({ id: `${index}`, name: `${index}`, hand: [] }));
  it("shows every player for a spectator", () => {
    expect(tableSeats(players, "spectator")).toEqual({
      bottom: players[0],
      left: players[1],
      top: players[2],
      right: players[3],
    });
  });
  it("keeps two-player waiting slots empty rather than duplicating an opponent", () => {
    expect(tableSeats(players.slice(0, 2), "0")).toEqual({
      bottom: players[0],
      left: players[1],
      top: undefined,
      right: undefined,
    });
  });
  it("rotates the viewer to the bottom", () => {
    expect(tableSeats(players, "2")).toEqual({
      bottom: players[2],
      left: players[3],
      top: players[0],
      right: players[1],
    });
  });
});
