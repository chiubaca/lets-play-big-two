// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

import { Card } from "./card";

describe("Card", () => {
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
