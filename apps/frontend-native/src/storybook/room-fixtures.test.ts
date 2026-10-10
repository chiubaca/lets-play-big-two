import { describe, expect, it } from "vite-plus/test";
import { getCardKey } from "@big-two/game-core";
import { getLegalPlays } from "@big-two/game-ai";
import { createRoomFixture, roomScenarios } from "./room-fixtures";

describe("Storybook room fixtures", () => {
  it.each(roomScenarios)("keeps private hands out of the %s spectator projection", (scenario) => {
    const room = createRoomFixture(scenario, "spectator");
    expect(room.context.players.every((player) => player.hand.length === 0)).toBe(true);
    expect(room.context.players.length).toBeGreaterThan(0);
  });

  it.each(roomScenarios)("exposes only the selected Player's hand in %s", (scenario) => {
    for (const viewer of ["host", "guest"] as const) {
      const room = createRoomFixture(scenario, viewer);
      for (const player of room.context.players) {
        expect(player.hand.length).toBe(player.id === viewer ? room.handCounts[viewer] : 0);
      }
      const cards = [
        ...room.context.players.flatMap((player) => player.hand),
        ...room.context.cardPile.flat(),
      ];
      expect(new Set(cards.map(getCardKey)).size).toBe(cards.length);
    }
  });

  it("offers legal combinations and a genuinely pass-only state", () => {
    for (const scenario of ["single", "pairs", "combo", "no-legal-play"] as const) {
      const { context } = createRoomFixture(scenario);
      const legal = getLegalPlays({
        hand: context.players[0].hand,
        roundMode: context.roundMode,
        cardsToBeat: context.cardPile.at(-1),
      });
      expect(legal.length > 0).toBe(scenario !== "no-legal-play");
    }
  });

  it("creates independent fixtures so edits do not leak between stories", () => {
    const first = createRoomFixture("first-move");
    first.context.players[0].hand[0].value = "A";
    first.context.players[0].name = "Edited";
    const next = createRoomFixture("first-move");
    expect(next.context.players[0].hand[0].value).toBe("3");
    expect(next.context.players[0].name).toBe("Alex");
  });
});
