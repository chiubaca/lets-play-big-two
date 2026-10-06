import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { HomeScrollScene } from "./home-scroll-scene";

const accessibility = vi.hoisted(() => ({
  enabled: vi.fn(),
  subscribe: vi.fn(),
  remove: vi.fn(),
}));
const viewport = vi.hoisted(() => ({ width: 800, height: 800 }));

vi.mock("react-native", () => {
  class AnimationNode {
    constructor(public evaluate: () => number) {}
    interpolate({ inputRange, outputRange }: { inputRange: number[]; outputRange: number[] }) {
      return new AnimationNode(() => {
        const value = this.evaluate();
        const last = inputRange.length - 1;
        if (value <= inputRange[0]!) return outputRange[0]!;
        if (value >= inputRange[last]!) return outputRange[last]!;
        const index = inputRange.findIndex((point) => point > value) - 1;
        const progress =
          (value - inputRange[index]!) / (inputRange[index + 1]! - inputRange[index]!);
        return outputRange[index]! + progress * (outputRange[index + 1]! - outputRange[index]!);
      });
    }
  }
  class Value extends AnimationNode {
    value: number;
    constructor(value: number) {
      super(() => this.value);
      this.value = value;
    }
  }
  const binary =
    (operation: (a: number, b: number) => number) =>
    (a: AnimationNode | number, b: AnimationNode | number) =>
      new AnimationNode(() =>
        operation(
          typeof a === "number" ? a : a.evaluate(),
          typeof b === "number" ? b : b.evaluate(),
        ),
      );
  return {
    View: "View",
    StyleSheet: { create: (styles: unknown) => styles, absoluteFill: { position: "absolute" } },
    useWindowDimensions: () => viewport,
    AccessibilityInfo: {
      isReduceMotionEnabled: accessibility.enabled,
      addEventListener: accessibility.subscribe,
    },
    Animated: {
      Value,
      add: binary((a, b) => a + b),
      subtract: binary((a, b) => a - b),
      multiply: binary((a, b) => a * b),
      divide: binary((a, b) => a / b),
      View: "AnimatedView",
      ScrollView: "AnimatedScrollView",
      event: (mapping: { nativeEvent: { contentOffset: { y: Value } } }[], options: unknown) =>
        Object.assign(
          (event: { nativeEvent: { contentOffset: { y: number } } }) => {
            mapping[0]!.nativeEvent.contentOffset.y.value = event.nativeEvent.contentOffset.y;
          },
          { options },
        ),
    },
  };
});
vi.mock("./brand", () => ({ Brand: "Brand" }));
vi.mock("./primitives", async () => {
  const { createElement: element } = await import("react");
  return {
    CasinoBackdrop: "CasinoBackdrop",
    CasinoScreen: ({
      children,
      backdrop,
    }: {
      children: React.ReactNode;
      backdrop: React.ReactNode;
    }) => element("CasinoScreen", null, backdrop, children),
  };
});

let renderer: ReactTestRenderer;
let changeMotion: (value: boolean) => void;
const host = (type: string) => renderer.root.find((node) => node.type === type);
const hosts = (type: string) => renderer.root.findAll((node) => node.type === type);
const layerOpacity = (node: ReturnType<typeof host>) =>
  node.parent!.props.style[1].opacity.evaluate();
const logoOpacity = () =>
  hosts("Brand").reduce((combined, brand) => {
    const alpha = layerOpacity(brand);
    return alpha + combined * (1 - alpha);
  }, 0);
const scene = () =>
  createElement(HomeScrollScene, {
    nav: "Account",
    children: "Modes",
    footer: "Footer",
    overlays: "Sheets",
  });
const mount = async () => {
  await act(async () => {
    renderer = create(scene());
  });
};
const layout = (testID: string, y: number, height: number) =>
  renderer.root.findByProps({ testID }).props.onLayout({
    nativeEvent: { layout: { x: 0, y, width: 500, height } },
  });

beforeEach(() => {
  Object.assign(viewport, { width: 800, height: 800 });
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  accessibility.enabled.mockResolvedValue(false);
  accessibility.subscribe.mockImplementation((_event, listener) => {
    changeMotion = listener;
    return { remove: accessibility.remove };
  });
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  vi.clearAllMocks();
});

describe("native home scroll scene", () => {
  it("uses native scroll animation, sticky navigation, and only one accessible logo", async () => {
    await mount();
    const scroll = host("AnimatedScrollView");
    expect(scroll.props.onScroll.options).toEqual({ useNativeDriver: true });
    expect(scroll.props.stickyHeaderIndices).toBeUndefined();
    const nav = renderer.root.findByProps({ testID: "home-nav-overlay" });
    expect(nav.props.pointerEvents).toBe("box-none");
    expect(nav.props.style[1].transform[0].translateY.evaluate()).toBe(14);
    scroll.props.onScroll({ nativeEvent: { contentOffset: { y: 100 } } });
    expect(nav.props.style[1].transform[0].translateY.evaluate()).toBe(0);
    expect(scroll.props.removeClippedSubviews).toBe(false);
    expect(renderer.root.findAllByProps({ accessibilityLabel: "Big Two Crew" })).toHaveLength(1);
    expect(renderer.root.findByProps({ testID: "home-logo" }).props.accessibilityRole).toBe(
      "header",
    );
    expect(hosts("Brand").map((brand) => brand.props.blurRadius)).toEqual([0, 6, 12]);
    expect(hosts("Brand").every((brand) => !brand.props.accessible)).toBe(true);
    expect(
      hosts("Brand").every((brand) => brand.parent!.props.needsOffscreenAlphaCompositing),
    ).toBe(true);
  });

  it("matches midpoint/end effects, reverses, and releases at the hero bottom", async () => {
    await mount();
    await act(async () => {
      layout("home-copy", 78, 1022);
      layout("home-logo-stage", 27, 424);
      layout("home-mode-foreground", 471, 551);
    });
    const scroll = host("AnimatedScrollView");
    const logo = () => renderer.root.findByProps({ testID: "home-logo" }).props.style;
    const pin = () => renderer.root.findByProps({ testID: "home-logo-pin" }).props.style;
    scroll.props.onScroll({ nativeEvent: { contentOffset: { y: 257.2 } } });
    expect(logoOpacity()).toBeCloseTo(0.75);
    expect(logo().transform[0].scale.evaluate()).toBeCloseTo(0.97);
    scroll.props.onScroll({ nativeEvent: { contentOffset: { y: 1000 } } });
    expect(logoOpacity()).toBe(0.5);
    expect(logo().transform[0].scale.evaluate()).toBe(0.94);
    expect(pin().transform[0].translateY.evaluate()).toBe(571);
    scroll.props.onScroll({ nativeEvent: { contentOffset: { y: 0 } } });
    expect(logoOpacity()).toBe(1);
    expect(logo().transform[0].scale.evaluate()).toBe(1);
    expect(pin().transform[0].translateY.evaluate()).toBe(0);
  });

  it("crossfades adjacent logo blur levels but keeps the opaque backdrop base visible", async () => {
    await mount();
    await act(async () => {
      layout("home-copy", 78, 1022);
      layout("home-logo-stage", 27, 424);
      layout("home-mode-foreground", 471, 551);
    });
    for (const [progress, logoWeights, backdropWeights] of [
      [0, [1, 0, 0], [1, 0, 0]],
      [0.25, [0.5, 0.5, 0], [1, 0.5, 0]],
      [0.5, [0, 1, 0], [1, 1, 0]],
      [0.75, [0, 0.5, 0.5], [1, 1, 0.5]],
      [1, [0, 0, 1], [1, 1, 1]],
    ] as const) {
      host("AnimatedScrollView").props.onScroll({
        nativeEvent: { contentOffset: { y: 77 + progress * 360.4 } },
      });
      const brands = hosts("Brand");
      const fade = 1 - progress * 0.5;
      brands.forEach((brand, index) => {
        const contribution =
          layerOpacity(brand) *
          brands
            .slice(index + 1)
            .reduce((remaining, above) => remaining * (1 - layerOpacity(above)), 1);
        expect(contribution).toBeCloseTo(logoWeights[index]! * fade);
      });
      expect(logoOpacity()).toBeCloseTo(fade);
      hosts("CasinoBackdrop").forEach((backdrop, index) => {
        expect(layerOpacity(backdrop)).toBeCloseTo(backdropWeights[index]!);
        expect(backdrop.props.overscan).toBe(20);
      });
    }
  });

  it("recalculates when signed-in content changes the layout", async () => {
    await mount();
    await act(async () => {
      layout("home-copy", 78, 1022);
      layout("home-logo-stage", 27, 424);
      layout("home-mode-foreground", 471, 551);
    });
    host("AnimatedScrollView").props.onScroll({
      nativeEvent: { contentOffset: { y: 1000 } },
    });
    await act(async () => layout("home-copy", 78, 722));
    const pin = renderer.root.findByProps({ testID: "home-logo-pin" }).props.style;
    expect(pin.transform[0].translateY.evaluate()).toBe(271);
    expect(logoOpacity()).toBeCloseTo(1 - (251 / 360.4) * 0.5);
  });

  it("resizes the logo and recalculates pinning after rotation while scrolled", async () => {
    Object.assign(viewport, { width: 390, height: 844 });
    await mount();
    expect(hosts("Brand")[0]!.props.width).toBe(362);
    host("AnimatedScrollView").props.onScroll({ nativeEvent: { contentOffset: { y: 300 } } });
    await act(async () => {
      Object.assign(viewport, { width: 844, height: 390 });
      renderer.update(scene());
    });
    await act(async () => {
      layout("home-copy", 78, 750);
      layout("home-logo-stage", 27, 318);
      layout("home-mode-foreground", 365, 385);
    });
    expect(hosts("Brand")[0]!.props.width).toBe(300);
    const pin = renderer.root.findByProps({ testID: "home-logo-pin" }).props.style;
    expect(pin.transform[0].translateY.evaluate()).toBeCloseTo(227);
    expect(logoOpacity()).toBeCloseTo(1 - (207 / (318 * 0.85)) * 0.5);
  });

  it("removes sticky logo transforms and blur when reduced motion changes live", async () => {
    await mount();
    await act(async () => changeMotion(true));
    expect(renderer.root.findByProps({ testID: "home-logo-pin" }).props.style).toBeUndefined();
    expect(renderer.root.findByProps({ testID: "home-logo" }).props.style).toBeUndefined();
    expect(hosts("Brand")).toHaveLength(1);
    expect(hosts("CasinoBackdrop")).toHaveLength(1);
    await act(async () => changeMotion(false));
    expect(hosts("Brand")).toHaveLength(3);
  });

  it("stays motion-free if the accessibility query fails and cleans up its listener", async () => {
    accessibility.enabled.mockRejectedValue(new Error("unavailable"));
    await mount();
    expect(hosts("Brand")).toHaveLength(1);
    await act(async () => renderer.unmount());
    expect(accessibility.remove).toHaveBeenCalledOnce();
  });

  it("does not let a stale initial query override a newer reduced-motion event", async () => {
    let resolve: (value: boolean) => void = () => {};
    accessibility.enabled.mockReturnValue(
      new Promise<boolean>((done) => {
        resolve = done;
      }),
    );
    await mount();
    await act(async () => {
      changeMotion(true);
      resolve(false);
    });
    expect(hosts("Brand")).toHaveLength(1);
  });
});
