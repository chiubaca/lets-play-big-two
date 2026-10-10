import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { LossResult } from "./loss-result";

vi.mock("react-native", () => ({
  Image: "Image",
  View: "View",
  StyleSheet: { create: (styles: unknown) => styles },
  useWindowDimensions: () => ({ width: 393, height: 852 }),
}));
vi.mock("expo-linear-gradient", () => ({ LinearGradient: "LinearGradient" }));
vi.mock("./cards", () => ({ CardSuit: "CardSuit" }));
vi.mock("./primitives", () => ({ Label: "Label" }));
vi.mock("./theme", () => ({ artwork: { loser: "loser" }, fonts: { strong: "InterSemiBold" } }));

let renderer: ReactTestRenderer;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
});
const mount = async (winnerName?: string) => {
  await act(async () => {
    renderer = create(createElement(LossResult, { winnerName }));
  });
};

describe("loss result", () => {
  it("uses subdued loss artwork without the card illustration", async () => {
    await mount("Mei");
    expect(renderer.root.findByProps({ heading: true }).props.children).toBe("You lost.");
    expect(renderer.root.findByProps({ children: "Mei wins this hand." })).toBeDefined();
    expect(renderer.root.findAllByProps({ source: "loser" })).toHaveLength(1);
    expect(renderer.root.findAllByProps({ testID: "loss-fallen-card" })).toHaveLength(0);
    const artwork = renderer.root.findByProps({ testID: "loss-artwork" });
    expect(artwork.props.pointerEvents).toBe("none");
    expect(artwork.props.importantForAccessibility).toBe("no-hide-descendants");
  });

  it("does not render an undefined winner name", async () => {
    await mount();
    expect(renderer.root.findByProps({ children: "Someone else took the table." })).toBeDefined();
  });

  it.each([200, 320, 432])("keeps the artwork bounded in a %i-point body", async (width) => {
    await mount("Mei");
    await act(async () =>
      renderer.root.findByProps({ testID: "loss-result" }).props.onLayout({
        nativeEvent: { layout: { width } },
      }),
    );
    const artWidth = Math.min(width, 240);
    expect(renderer.root.findByProps({ testID: "loss-artwork" }).props.style).toEqual({
      width: artWidth,
      height: artWidth * 0.56,
    });
  });
});
