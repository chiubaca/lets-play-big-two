// sum.test.js
import { expect, test } from "vitest";
import { rotatePlayerIndex } from "./game-state-machine.ts";

test.each([
  [{ currentPlayerIndex: 0, totalPlayers: 3 }, 1],
  [{ currentPlayerIndex: 1, totalPlayers: 3 }, 2],
  [{ currentPlayerIndex: 2, totalPlayers: 3 }, 3],
  [{ currentPlayerIndex: 3, totalPlayers: 3 }, 0],
])("given %o rotatePlayerIndex bumps the player index %i", (args, updatedIndex) => {
  expect(rotatePlayerIndex(args)).toBe(updatedIndex);
});

test.each([
  [{ currentPlayerIndex: 0, totalPlayers: 1 }, 1],
  [{ currentPlayerIndex: 1, totalPlayers: 1 }, 0],
])("given %o rotatePlayerIndex bumps the player index %i", (args, updatedIndex) => {
  expect(rotatePlayerIndex(args)).toBe(updatedIndex);
});

test("throw if a bad player index is computed", () => {
  expect(() =>
    rotatePlayerIndex({
      currentPlayerIndex: 5,
      totalPlayers: 3,
    }),
  ).toThrowError("max index can only be 3");
});

test("throw if a bad player index is computed", () => {
  expect(() =>
    rotatePlayerIndex({
      currentPlayerIndex: 2,
      totalPlayers: 1,
    }),
  ).toThrowError("max index can only be 1");
});
