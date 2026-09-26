// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vite-plus/test";
import { PassAndPlay } from "./pass-and-play";

afterEach(cleanup);

it("configures the number of seats and optional bot players", () => {
  render(<PassAndPlay onBack={() => {}} />);
  expect(screen.getByRole("button", { name: "4" }).getAttribute("aria-pressed")).toBe("true");
  expect(
    screen
      .getByRole("combobox", { name: "Player 3 type" })
      .querySelector("option:checked")
      ?.getAttribute("value"),
  ).toBe("bot");

  fireEvent.click(screen.getByRole("button", { name: "3" }));
  expect(screen.queryByRole("combobox", { name: "Player 4 type" })).toBeNull();
  fireEvent.change(screen.getByRole("combobox", { name: "Player 2 type" }), {
    target: { value: "bot" },
  });
  expect(screen.queryByRole("textbox", { name: "Player 2" })).toBeNull();

  fireEvent.change(screen.getByRole("textbox", { name: "Player 1" }), {
    target: { value: "" },
  });
  expect(screen.getByRole("button", { name: "Start game" }).hasAttribute("disabled")).toBe(true);
});

it("keeps hands out of the DOM until Ready, then hides them after playing and passing", async () => {
  const { container } = render(<PassAndPlay onBack={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "2" }));
  const deal = screen.getByRole("button", { name: "Start game" });
  fireEvent.change(screen.getByLabelText("Player 1"), { target: { value: "Alex" } });
  fireEvent.change(screen.getByLabelText("Player 2"), { target: { value: "Blair" } });
  fireEvent.click(deal);
  expect(screen.getByRole("dialog").textContent).toMatch(/Hand to (Alex|Blair)/);
  expect(container.querySelectorAll(".hand-card")).toHaveLength(0);
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(screen.getByRole("button", { name: "Ready" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Ready" }));
  expect(screen.queryByRole("button", { name: /Copy room code/ })).toBeNull();
  expect(container.querySelectorAll(".hand-card")).toHaveLength(26);
  fireEvent.click(screen.getByRole("button", { name: "3 of diamonds" }));
  fireEvent.click(screen.getByRole("button", { name: "Play selected cards" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Ready" })).toBeTruthy());
  expect(container.querySelectorAll(".hand-card")).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Ready" }));
  fireEvent.click(screen.getByRole("button", { name: "Pass turn" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Ready" })).toBeTruthy());
  expect(container.querySelectorAll(".hand-card")).toHaveLength(0);
});
