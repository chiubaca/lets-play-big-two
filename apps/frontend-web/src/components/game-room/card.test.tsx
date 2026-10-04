// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

import { Card } from "./card";

describe("Card", () => {
  it.each(["DIAMOND", "CLUB", "HEART", "SPADE"] as const)(
    "renders mirrored rank and suit corners with a central %s pip",
    (suit) => {
      const { container } = render(<Card card={{ suit, value: "10" }} />);
      const corners = container.querySelectorAll(".card-corner");
      expect(corners).toHaveLength(2);
      for (const corner of corners) {
        expect(corner.querySelector(".card-value")?.textContent).toBe("10");
        expect(corner.querySelector(".card-suit")?.textContent).toBe(
          container.querySelector(".card-center")?.textContent,
        );
        expect(corner.getAttribute("aria-hidden")).toBe("true");
      }
      expect(corners[1].classList.contains("card-corner-bottom")).toBe(true);
    },
  );

  it("exposes its identity and selection state", () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <Card card={{ suit: "DIAMOND", value: "3" }} onClick={onClick} selected={false} />,
    );

    const card = screen.getByRole("button", { name: "3 of diamonds" });
    expect(card.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(card);
    expect(onClick).toHaveBeenCalledOnce();

    rerender(<Card card={{ suit: "DIAMOND", value: "3" }} onClick={onClick} selected />);
    expect(card.getAttribute("aria-pressed")).toBe("true");
  });
});
