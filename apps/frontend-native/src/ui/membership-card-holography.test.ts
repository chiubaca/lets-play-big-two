import { expect, it } from "vite-plus/test";
import {
  foilStops,
  membershipFoilGeometry,
  metalStops,
  restingCardLight,
} from "./membership-card-holography";

it("uses the web's repeating rainbow and metallic stops rather than a single static color wash", () => {
  expect(foilStops.slice(0, 6)).toEqual([
    { offset: 0, color: "#f5a9c5" },
    { offset: 0.12, color: "#efd58d" },
    { offset: 0.24, color: "#a3e5b0" },
    { offset: 0.36, color: "#85dce5" },
    { offset: 0.48, color: "#b5a5e8" },
    { offset: 0.6, color: "#f5a9c5" },
  ]);
  expect(metalStops).toHaveLength(51);
  expect(metalStops.at(-1)?.offset).toBe(1);
});

it.each(["rainbow", "metal", "reflection"] as const)(
  "moves the full-card %s layer with tilt",
  (layer) => {
    const left = membershipFoilGeometry(382, 266, {
      ...restingCardLight,
      foilX: 0.35,
      foilY: 0.35,
    });
    const right = membershipFoilGeometry(382, 266, {
      ...restingCardLight,
      foilX: 0.65,
      foilY: 0.65,
    });
    expect(left[layer].x1).not.toBe(right[layer].x1);
    expect(left[layer].y1).not.toBe(right[layer].y1);
    expect(left[layer].x2 - left[layer].x1).toBeCloseTo(right[layer].x2 - right[layer].x1);
  },
);

it.each([0.35, 0.5, 0.65])(
  "covers every card corner at foil position %s without clamped solid-color edges",
  (position) => {
    for (const [width, height] of [
      [292, 252],
      [382, 266],
      [440, 350],
    ]) {
      const geometry = membershipFoilGeometry(width!, height!, {
        ...restingCardLight,
        foilX: position,
        foilY: position,
      });
      for (const layer of [geometry.rainbow, geometry.metal, geometry.reflection]) {
        const dx = layer.x2 - layer.x1;
        const dy = layer.y2 - layer.y1;
        for (const [x, y] of [
          [0, 0],
          [width!, 0],
          [0, height!],
          [width!, height!],
        ]) {
          const progress = ((x! - layer.x1) * dx + (y! - layer.y1) * dy) / (dx * dx + dy * dy);
          expect(progress).toBeGreaterThan(0);
          expect(progress).toBeLessThan(1);
        }
      }
    }
  },
);

it("positions a circular light source in card-space, reaching the farthest corner", () => {
  const geometry = membershipFoilGeometry(400, 266, { ...restingCardLight, x: 0.25, y: 0.75 });
  expect(geometry.lightX).toBe(100);
  expect(geometry.lightY).toBe(199.5);
  expect(geometry.lightRadius).toBeCloseTo(Math.hypot(300, 199.5));
});
