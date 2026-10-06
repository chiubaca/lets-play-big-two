import { describe, expect, it } from "vite-plus/test";
import { handLayout } from "./hand-layout";

describe("native card fan", () => {
  it.each([320, 390, 760])("centers a full hand at width %i", (width) => {
    const layout = handLayout(width, 13);
    const first = layout.card(0);
    const last = layout.card(12);
    expect(first.left + last.left + layout.cardWidth).toBeCloseTo(width);
    expect(first.top).toBe(last.top);
    expect(first.angle).toBe(-16);
    expect(last.angle).toBe(16);
    expect(layout.card(6).angle).toBe(0);
    expect(first.left).toBeGreaterThan(0);
    expect(last.left + layout.cardWidth).toBeLessThan(width);
  });

  it("centers the last card without an arc or rotation", () => {
    const layout = handLayout(390, 1);
    const card = layout.card(0);
    expect(card.left + layout.cardWidth / 2).toBe(195);
    expect(card.angle).toBe(0);
    expect(card.top).toBe(20);
  });

  it("lifts a selected card without changing its order or angle", () => {
    const layout = handLayout(390, 13);
    const normal = layout.card(3);
    const selected = layout.card(3, true);
    expect(selected.left).toBe(normal.left);
    expect(selected.angle).toBe(normal.angle);
    expect(normal.top - selected.top).toBe(20);
    expect(layout.card(6, true).top).toBe(0);
  });

  it("keeps the smaller landscape fan within its reserved height", () => {
    const layout = handLayout(580, 13, true);
    expect(layout.cardWidth).toBe(50);
    expect(layout.card(0).top + layout.cardHeight).toBeCloseTo(layout.height);
    expect(layout.card(0).top - layout.card(0, true).top).toBe(14);
  });

  it("handles an empty, private hand without non-finite dimensions", () => {
    const layout = handLayout(390, 0);
    expect(Number.isFinite(layout.height)).toBe(true);
    expect(Number.isFinite(layout.cardWidth)).toBe(true);
  });
});
