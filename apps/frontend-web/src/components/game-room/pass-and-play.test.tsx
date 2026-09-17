// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vite-plus/test";
import { PassAndPlay } from "./pass-and-play";

afterEach(cleanup);

it("keeps hands out of the DOM until Ready, then hides them after playing and passing", async () => {
  const { container } = render(<PassAndPlay onBack={() => {}} />);
  const deal = screen.getByRole("button", { name: "Deal cards" });
  expect(deal.hasAttribute("disabled")).toBe(true);
  fireEvent.change(screen.getByLabelText("Player 1"), { target: { value: "Alex" } });
  fireEvent.change(screen.getByLabelText("Player 2"), { target: { value: "Blair" } });
  fireEvent.click(deal);
  expect(screen.getByRole("dialog").textContent).toMatch(/Hand to (Alex|Blair)/);
  expect(container.querySelectorAll(".hand-card")).toHaveLength(0);
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(screen.getByRole("button", { name: "Ready" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Ready" }));
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
