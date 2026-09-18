// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vite-plus/test";

import type { JevDecisionLogEntry } from "./use-offline-game";
import { JevDevtools } from "./jev-devtools";

afterEach(cleanup);

const decisions: JevDecisionLogEntry[] = [
  {
    sequence: 3,
    playerId: "bot-jev",
    playerName: "Bob",
    decision: {
      cards: null,
      source: "jev",
      confidence: 0.88,
      model: "jev-1.13.0",
      trace: {
        selectedAction: "pass",
        questions: {
          play_or_pass: {
            choice: "pass",
            confidence: 0.88,
            probabilities: { play: 0.12, pass: 0.88 },
            options: { play: "Contest the trick", pass: "Strategically pass" },
          },
          best_play: {
            choice: "play_1",
            confidence: 0.76,
            probabilities: { play_1: 0.76, play_2: 0.24 },
            options: {
              play_1: "single: ace of hearts",
              play_2: "single: 2 of spades",
            },
          },
        },
      },
    },
  },
];

it("shows Jev's action and question probabilities", () => {
  render(<JevDevtools decisions={decisions} />);

  expect(screen.getByRole("complementary", { name: "Jev decision devtools" })).toBeTruthy();
  expect(screen.getByText("PASS")).toBeTruthy();
  expect(screen.getByText("Tempo decision")).toBeTruthy();
  expect(
    screen
      .getByRole("progressbar", { name: "Strategically pass probability" })
      .getAttribute("aria-valuenow"),
  ).toBe("88");
  expect(screen.getByText("single: ace of hearts")).toBeTruthy();
});

it("collapses to a compact trigger", () => {
  render(<JevDevtools decisions={decisions} />);

  fireEvent.click(screen.getByRole("button", { name: "Close Jev decision devtools" }));

  expect(screen.queryByRole("complementary", { name: "Jev decision devtools" })).toBeNull();
  expect(screen.getByRole("button", { name: "Open Jev decision devtools" })).toBeTruthy();
});

it("can be dragged by its header and reset with a double click", () => {
  render(<JevDevtools decisions={decisions} />);
  const panel = screen.getByRole("complementary", { name: "Jev decision devtools" });
  const header = panel.querySelector<HTMLElement>(".jev-devtools-header")!;

  fireEvent.pointerDown(header, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(header, { pointerId: 1, clientX: 140, clientY: 125 });
  fireEvent.pointerUp(header, { pointerId: 1 });

  expect(panel.getAttribute("style")).toContain("--jev-drag-x: 40px");
  expect(panel.getAttribute("style")).toContain("--jev-drag-y: 25px");

  fireEvent.doubleClick(header);
  expect(panel.getAttribute("style")).toContain("--jev-drag-x: 0px");
  expect(panel.getAttribute("style")).toContain("--jev-drag-y: 0px");
});
