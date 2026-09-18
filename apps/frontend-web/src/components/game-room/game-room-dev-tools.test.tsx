// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { GameRoomDevTools } from "./game-room-dev-tools";

function renderTools() {
  return render(
    <GameRoomDevTools
      handCount={13}
      fanOut={100}
      arc={5}
      selectedLift={27}
      showGuides={false}
      showCardOrder={false}
      motion
      onFanOutChange={vi.fn()}
      onArcChange={vi.fn()}
      onSelectedLiftChange={vi.fn()}
      onShowGuidesChange={vi.fn()}
      onShowCardOrderChange={vi.fn()}
      onMotionChange={vi.fn()}
      onReset={vi.fn()}
    />,
  );
}

describe("GameRoomDevTools", () => {
  afterEach(cleanup);

  it("shows live viewport metrics and hand controls", () => {
    renderTools();

    expect(screen.getByText(/^\d+ × \d+$/)).toBeTruthy();
    expect(screen.getByText(/screen/)).toBeTruthy();
    expect(screen.getByText("13 cards")).toBeTruthy();
    expect(screen.getByLabelText("Fan out")).toBeTruthy();
    expect(screen.getByLabelText("Card arc")).toBeTruthy();
  });

  it("can collapse the inspector", () => {
    renderTools();

    fireEvent.click(screen.getByRole("button", { name: /dev tools/i }));

    expect(screen.queryByLabelText("Fan out")).toBeNull();
    expect(screen.getByRole("button", { name: /dev tools/i }).getAttribute("aria-expanded")).toBe(
      "false",
    );
  });
});
