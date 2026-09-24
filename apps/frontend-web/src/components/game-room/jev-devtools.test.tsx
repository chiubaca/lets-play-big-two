// @vitest-environment jsdom

import { useEffect } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vite-plus/test";

import type { JevDecisionLogEntry } from "./use-offline-game";
import { JevDevtools } from "./jev-devtools";
import { JevDevtoolsProvider, useJevDevtools } from "./jev-devtools-context";

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

function DecisionFeed({ entries }: { entries: JevDecisionLogEntry[] }) {
  const { setDecisions } = useJevDevtools();
  useEffect(() => {
    setDecisions(entries);
    return () => setDecisions([]);
  }, [entries, setDecisions]);
  return null;
}

function renderDevtools(entries: JevDecisionLogEntry[]) {
  return render(
    <JevDevtoolsProvider>
      <DecisionFeed entries={entries} />
      <JevDevtools />
    </JevDevtoolsProvider>,
  );
}

it("shows Jev's action and question probabilities", () => {
  renderDevtools(decisions);

  expect(screen.getByRole("region", { name: "Jev decision devtools" })).toBeTruthy();
  expect(screen.getByText("PASS")).toBeTruthy();
  expect(screen.getByText("Tempo decision")).toBeTruthy();
  expect(
    screen
      .getByRole("progressbar", { name: "Strategically pass probability" })
      .getAttribute("aria-valuenow"),
  ).toBe("88");
  expect(screen.getByText("single: ace of hearts")).toBeTruthy();
});

it("shows an empty state when no offline decisions are available", () => {
  renderDevtools([]);
  expect(screen.getByText("Awaiting inference")).toBeTruthy();
});

it("selects earlier decisions from the event buffer", () => {
  renderDevtools([
    ...decisions,
    {
      ...decisions[0],
      sequence: 2,
      playerName: "Alice",
      decision: { cards: null, source: "forced" },
    },
  ]);
  fireEvent.click(screen.getByRole("button", { name: "#02AlicePASS" }));
  expect(screen.getByText("Only one legal action was available.")).toBeTruthy();
});
