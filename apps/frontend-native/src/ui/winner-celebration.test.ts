import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { WinnerCelebration } from "./winner-celebration";
import { cancelAnimation, withDelay, withTiming } from "../test/reanimated";

const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock("react-native", () => ({
  Image: "Image",
  View: "View",
  StyleSheet: { create: (styles: unknown) => styles },
  useWindowDimensions: () => ({ width: 393, height: 852 }),
}));
vi.mock("react-native-reanimated", async () => import("../test/reanimated"));
vi.mock("expo-linear-gradient", () => ({ LinearGradient: "LinearGradient" }));
vi.mock("./primitives", () => ({ Label: "Label" }));
vi.mock("./cards", () => ({ CardSuit: "CardSuit" }));
vi.mock("./use-reduced-motion", () => ({ useReducedMotion: () => motion.reduced }));
vi.mock("./theme", () => ({
  artwork: { spade: "spade", winner: "winner" },
  colors: { gold: "gold", muted: "muted" },
  fonts: { strong: "InterSemiBold" },
}));

let renderer: ReactTestRenderer;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  motion.reduced = false;
  vi.clearAllMocks();
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
});
const mount = async () => {
  await act(async () => {
    renderer = create(createElement(WinnerCelebration));
  });
};

describe("winner celebration", () => {
  it("makes a finite entrance and suit burst, and cancels both on dismissal", async () => {
    await mount();
    expect(withTiming).toHaveBeenCalledTimes(2);
    expect(withTiming).toHaveBeenCalledWith(1, {
      duration: 650,
      easing: [0.16, 1, 0.3, 1],
      reduceMotion: "never",
    });
    expect(withDelay).toHaveBeenCalledWith(120, 1, "never");
    expect(renderer.root.findAllByProps({ testID: "winner-sparkle" })).toHaveLength(8);
    expect(renderer.root.findAllByProps({ source: "spade" })).toHaveLength(1);
    expect(renderer.root.findAllByProps({ source: "winner" })).toHaveLength(1);
    expect(renderer.root.findByProps({ heading: true }).props.children).toBe("You won!");
    await act(async () => renderer.unmount());
    expect(cancelAnimation).toHaveBeenCalledTimes(2);
  });

  it("shows the complete static celebration with reduced motion", async () => {
    motion.reduced = true;
    await mount();
    expect(withTiming).not.toHaveBeenCalled();
    expect(withDelay).not.toHaveBeenCalled();
    const hero = renderer.root.findByProps({ testID: "winner-hero" });
    expect(hero.props.style[1].opacity).toBe(1);
    expect(hero.props.style[1].transform).toEqual([{ translateY: 0 }, { scale: 1 }]);
    expect(hero.props.importantForAccessibility).toBe("no-hide-descendants");
  });

  it("stops motion when the accessibility preference changes", async () => {
    await mount();
    vi.clearAllMocks();
    motion.reduced = true;
    await act(async () => renderer.update(createElement(WinnerCelebration)));
    expect(cancelAnimation).toHaveBeenCalled();
    expect(withTiming).not.toHaveBeenCalled();
    expect(withDelay).not.toHaveBeenCalled();
  });

  it.each([240, 320, 432])(
    "fits the measured %i-point sheet body without restarting motion",
    async (width) => {
      await mount();
      vi.clearAllMocks();
      await act(async () =>
        renderer.root.findByProps({ testID: "winner-celebration" }).props.onLayout({
          nativeEvent: { layout: { width } },
        }),
      );
      const hero = renderer.root.findByProps({ testID: "winner-hero" });
      const artWidth = Math.min(width, 240);
      expect(hero.props.style[0]).toEqual({ width: artWidth, height: artWidth * 1.16 });
      expect(withTiming).not.toHaveBeenCalled();
    },
  );
});
