import { describe, expect, it } from "vite-plus/test";
import { readFileSync } from "node:fs";
import { URL } from "node:url";
import {
  HOME_SCROLL_EFFECTS,
  homeLogoWidth,
  homeScrollMotion,
  homeStickyTop,
} from "./home-scroll-motion";

describe("home scroll motion parity", () => {
  const geometry = {
    stageY: 105,
    stageHeight: 424,
    foregroundY: 549,
    containerBottom: 1100,
    stickyTop: 48,
  };

  it("keeps native effect constants aligned with the web's actual declarations", () => {
    const logoCss = readFileSync(
      new URL("../../../frontend-web/src/components/home-logo.css", import.meta.url),
      "utf8",
    );
    const screenCss = readFileSync(
      new URL("../../../frontend-web/src/components/home-screen.css", import.meta.url),
      "utf8",
    );
    const overlapHook = readFileSync(
      new URL("../../../frontend-web/src/components/use-scroll-overlap.ts", import.meta.url),
      "utf8",
    );
    expect(
      Number(logoCss.match(/opacity: calc\(1 - var\(--logo-overlap, 0\) \* ([\d.]+)/)?.[1]),
    ).toBe(HOME_SCROLL_EFFECTS.fade);
    expect(
      Number(logoCss.match(/scale\(calc\(1 - var\(--logo-overlap, 0\) \* ([\d.]+)/)?.[1]),
    ).toBe(HOME_SCROLL_EFFECTS.shrink);
    const blur = /blur\(calc\(var\(--logo-overlap, 0\) \* ([\d.]+)px/;
    expect(Number(logoCss.match(blur)?.[1])).toBe(HOME_SCROLL_EFFECTS.blur);
    expect(Number(screenCss.match(blur)?.[1])).toBe(HOME_SCROLL_EFFECTS.blur);
    expect(Number(overlapHook.match(/background\.height \* ([\d.]+)/)?.[1])).toBe(
      HOME_SCROLL_EFFECTS.overlapRatio,
    );
  });

  it("pins at the sticky inset and waits for the grid to reach the stage", () => {
    expect(homeScrollMotion(geometry)).toEqual({
      pinStart: 57,
      pinEnd: 628,
      maxTranslate: 571,
      overlapStart: 77,
      overlapEnd: 437.4,
      maxOverlap: 1,
    });
  });

  it("matches the web bounding-rectangle formula through scrolling and containment", () => {
    for (const containerBottom of [600, 800, 1100, 2000]) {
      const layout = { ...geometry, containerBottom };
      const motion = homeScrollMotion(layout);
      for (let scrollY = -40; scrollY <= 2000; scrollY += 10) {
        const translation = Math.max(0, Math.min(motion.maxTranslate, scrollY - motion.pinStart));
        const stageBottom = layout.stageY + layout.stageHeight + translation - scrollY;
        const foregroundTop = layout.foregroundY - scrollY;
        const webOverlap = Math.max(
          0,
          Math.min(1, (stageBottom - foregroundTop) / (layout.stageHeight * 0.85)),
        );
        const nativeOverlap =
          Math.max(
            0,
            Math.min(
              1,
              (scrollY - motion.overlapStart) / (motion.overlapEnd - motion.overlapStart),
            ),
          ) * motion.maxOverlap;
        expect(nativeOverlap).toBeCloseTo(webOverlap);
      }
    }
  });

  it("releases at the copy's bottom instead of sticking over the footer forever", () => {
    const motion = homeScrollMotion({ ...geometry, containerBottom: 800 });
    expect(motion.maxTranslate).toBe(271);
    expect(motion.maxOverlap).toBeCloseTo(251 / (424 * 0.85));
    expect(motion.overlapEnd).toBe(motion.pinEnd);
  });

  it("keeps interpolation ranges valid before layout or with no scrollable copy", () => {
    const motion = homeScrollMotion({
      stageY: 0,
      stageHeight: 0,
      foregroundY: 0,
      containerBottom: 0,
      stickyTop: 32,
    });
    expect(motion.maxTranslate).toBe(0);
    expect(motion.maxOverlap).toBe(0);
    expect(motion.overlapEnd).toBeGreaterThan(motion.overlapStart);
  });

  it("uses the web viewport-height sizing and clamps on phones/tablets/landscape", () => {
    expect(homeLogoWidth(390, 844)).toBe(362);
    expect(homeLogoWidth(800, 1000)).toBe(500);
    expect(homeLogoWidth(844, 390)).toBe(300);
    expect(homeStickyTop(390)).toBe(32);
    expect(homeStickyTop(844)).toBe(50.64);
    expect(homeStickyTop(1400)).toBe(80);
  });
});
