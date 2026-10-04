// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { BigTwoCheatSheet } from "./big-two-cheat-sheet";

afterEach(cleanup);

describe("BigTwoCheatSheet", () => {
  it("shows suit and rank ordering using the table’s existing cards as illustrations", () => {
    const { container } = render(<BigTwoCheatSheet />);
    expect(
      [...container.querySelectorAll(".cheat-suit-step > div > span:last-child")].map(
        (label) => label.textContent,
      ),
    ).toEqual(["Diamonds", "Clubs", "Hearts", "Spades"]);
    expect(container.querySelector(".cheat-rank-order")?.textContent).toBe("345678910JQKA2");
    expect(screen.getByRole("img", { name: "ace of spades" })).toBeTruthy();
    expect(container.querySelectorAll(".playing-card-fluid")).toHaveLength(33);
    expect(container.querySelectorAll(".card-center")).toHaveLength(33);
    expect(container.querySelectorAll("[inert]")).toHaveLength(33);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("lists five-card hands weakest to strongest and explains this table’s rules", () => {
    const { container } = render(<BigTwoCheatSheet />);
    expect(
      [...container.querySelectorAll(".cheat-combos strong")].map((heading) => heading.textContent),
    ).toEqual(["Straight", "Flush", "Full house", "Four of a kind", "Straight flush"]);
    for (const hand of container.querySelectorAll(".cheat-combos .cheat-hand")) {
      expect(hand.querySelectorAll('[role="img"]')).toHaveLength(5);
    }
    expect(screen.getByText(/No standalone triples/)).toBeTruthy();
    expect(screen.getByText(/Compare suit first/)).toBeTruthy();
    expect(screen.getByText(/The first play must include 3/)).toBeTruthy();
  });
});
