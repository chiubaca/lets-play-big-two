import { expect, it } from "vite-plus/test";
import {
  membershipCardLight,
  membershipCardReturn,
  membershipGradient,
  membershipInspectionScale,
} from "./membership-card-motion";

it("matches the web's five-degree tilt and clamps touch positions outside the card", () => {
  expect(membershipCardLight(0, 0, 400, 266)).toMatchObject({
    x: 0,
    y: 0,
    rotateX: 5,
    rotateY: -5,
  });
  expect(membershipCardLight(400, 266, 400, 266)).toMatchObject({
    x: 1,
    y: 1,
    rotateX: -5,
    rotateY: 5,
  });
  expect(membershipCardLight(200, 133, 400, 266)).toMatchObject({ rotateX: 0, rotateY: 0 });
  expect(membershipCardLight(-100, 500, 400, 266)).toMatchObject({ x: 0, y: 1 });
});

it.each([320, 375, 380, 390, 600, 900])(
  "uniformly enlarges the existing card at viewport width %i",
  (width) => {
    const card = { width: Math.min(440, width - 28), height: 266 };
    const viewport = { width, height: 900 };
    const zoom = membershipInspectionScale(card, viewport);
    const available = width <= 600 ? width - 16 : Math.min(656, width - 56);
    expect(card.width * zoom).toBeCloseTo(available);
    expect((card.width * zoom) / (card.height * zoom)).toBeCloseTo(card.width / card.height);
  },
);

it("returns to freshly measured bounds without changing the card's aspect ratio", () => {
  expect(
    membershipCardReturn(
      { x: 20, y: 80, width: 400, height: 266 },
      { x: 0, y: 200, width: 600, height: 399 },
    ),
  ).toEqual({ x: -80, y: -186.5, scale: 2 / 3 });
});

it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
  "rejects invalid return measurements: %s",
  (width) => {
    const box = { x: 0, y: 0, width: 400, height: 266 };
    expect(membershipCardReturn({ ...box, width }, box)).toBeNull();
    expect(membershipCardReturn(box, { ...box, width })).toBeNull();
  },
);

it("shrinks uniformly in short landscape viewports instead of clipping a long-name card", () => {
  const card = { width: 440, height: 350 };
  const zoom = membershipInspectionScale(card, { width: 844, height: 390 });
  expect(card.height * zoom).toBeCloseTo(230);
  expect(card.width * zoom).toBeLessThan(656);
});

it.each([120, 145, 115])(
  "preserves the %i-degree web gradient when a name changes the card height",
  (angle) => {
    for (const height of [252, 266, 350, 440]) {
      const gradient = membershipGradient(382, height, angle);
      const radians = Math.atan2(gradient.x2 - gradient.x1, -(gradient.y2 - gradient.y1));
      expect((radians * 180) / Math.PI).toBeCloseTo(angle);
      expect((gradient.x1 + gradient.x2) / 2).toBeCloseTo(191);
      expect((gradient.y1 + gradient.y2) / 2).toBeCloseTo(height / 2);
    }
  },
);
