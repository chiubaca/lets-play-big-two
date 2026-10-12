import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import type { SharedValue } from "react-native-reanimated";
import { readAnimatedStyle } from "../test/reanimated";
import { MembershipCardFoil } from "./membership-card-foil";
import {
  foilIntensity,
  glareIntensity,
  membershipFoilGeometry,
  restingCardLight,
  type MembershipCardLighting,
} from "./membership-card-holography";

vi.mock("react-native-reanimated", async () => import("../test/reanimated"));
vi.mock("react-native", () => ({
  View: "View",
  StyleSheet: {
    create: (styles: unknown) => styles,
    absoluteFill: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  },
}));
vi.mock("react-native-svg", () => ({
  default: "Svg",
  Circle: "Circle",
  Defs: "Defs",
  LinearGradient: "LinearGradient",
  Mask: "Mask",
  Pattern: "Pattern",
  RadialGradient: "RadialGradient",
  Rect: "Rect",
  Stop: "Stop",
}));

let renderer: ReactTestRenderer;
let light: SharedValue<MembershipCardLighting>;
let intensity: SharedValue<number>;
const frame = (style: Record<string, unknown>[]) =>
  Object.assign({}, ...style.map(readAnimatedStyle));
const fixture = () =>
  createElement(MembershipCardFoil, { width: 382, height: 266, light, intensity });
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  light = { value: restingCardLight } as SharedValue<MembershipCardLighting>;
  intensity = { value: 0 } as SharedValue<number>;
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
});

it("fills the entire card with noninteractive color-dodge foil and separate screen glare", async () => {
  await act(async () => {
    renderer = create(fixture());
  });
  for (const [testID, blend] of [
    ["membership-card-foil", "color-dodge"],
    ["membership-card-glare", "screen"],
  ]) {
    const surface = renderer.root.findByProps({ testID });
    expect(surface.props).toMatchObject({
      pointerEvents: "none",
      accessible: false,
      importantForAccessibility: "no-hide-descendants",
    });
    expect(frame(surface.props.style)).toMatchObject({
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      zIndex: 1,
      mixBlendMode: blend,
    });
  }
  const foil = renderer.root.findByProps({ testID: "membership-card-foil" });
  expect(foil.findAll((node) => String(node.type) === "Mask")).toHaveLength(0);
  expect(foil.findAll((node) => String(node.type) === "Rect")).toHaveLength(3);
});

it("moves cached rainbow, metallic and reflection textures without rebuilding any SVG gradients", async () => {
  await act(async () => {
    renderer = create(fixture());
  });
  const gradients = () =>
    renderer.root.findAll((node) =>
      ["LinearGradient", "RadialGradient"].includes(String(node.type)),
    );
  const originalProps = gradients().map((node) => node.props);
  const linear = renderer.root.findAll((node) => String(node.type) === "LinearGradient");
  const active = { ...restingCardLight, x: 0.2, y: 0.8, foilX: 0.41, foilY: 0.59, active: true };
  light.value = active;
  intensity.value = 1;
  const geometry = membershipFoilGeometry(382, 266, active);
  for (const [index, field] of (["rainbow", "metal", "reflection"] as const).entries()) {
    const node = renderer.root.findByProps({ testID: `membership-card-${field}-field` });
    const transform = frame(node.props.style).transform;
    expect(linear[index]!.props.x1 + transform[0].translateX).toBeCloseTo(geometry[field].x1);
    expect(linear[index]!.props.y1 + transform[1].translateY).toBeCloseTo(geometry[field].y1);
    // Decoded images already live on the GPU; another cached native surface
    // would duplicate the large textures during the modal's first frames.
    expect(node.props.renderToHardwareTextureAndroid).toBeUndefined();
    expect(node.props.shouldRasterizeIOS).toBeUndefined();
  }
  const radial = renderer.root.findByProps({ testID: "membership-card-foil-light" });
  expect(frame(radial.props.style).transform.slice(0, 2)).toEqual([
    { translateX: 382 * 0.2 },
    { translateY: 266 * 0.8 },
  ]);
  gradients().forEach((node, index) => expect(node.props).toBe(originalProps[index]));
  expect(
    frame(renderer.root.findByProps({ testID: "membership-card-foil" }).props.style).opacity,
  ).toBe(foilIntensity.active);
  expect(
    frame(renderer.root.findByProps({ testID: "membership-card-glare" }).props.style).opacity,
  ).toBe(glareIntensity.active);
});

it.each([0.35, 0.5, 0.65])(
  "keeps cached textures covering all edges at foil position %s",
  async (position) => {
    await act(async () => {
      renderer = create(fixture());
    });
    light.value = { ...restingCardLight, foilX: position, foilY: position };
    for (const field of ["rainbow", "metal", "reflection"]) {
      const node = renderer.root.findByProps({ testID: `membership-card-${field}-field` });
      const { left, top, width, height, transform } = frame(node.props.style);
      const x = left + transform[0].translateX;
      const y = top + transform[1].translateY;
      expect(x).toBeLessThanOrEqual(0.000001);
      expect(y).toBeLessThanOrEqual(0.000001);
      expect(x + width).toBeGreaterThanOrEqual(382 - 0.000001);
      expect(y + height).toBeGreaterThanOrEqual(266 - 0.000001);
    }
  },
);

it("fades intensity on the UI thread while retaining the last foil position", async () => {
  await act(async () => {
    renderer = create(fixture());
  });
  light.value = { ...restingCardLight, foilX: 0.6, foilY: 0.4, active: true };
  intensity.value = 1;
  const field = renderer.root.findByProps({ testID: "membership-card-rainbow-field" });
  const position = frame(field.props.style).transform;
  intensity.value = 0;
  expect(frame(field.props.style).transform).toEqual(position);
  expect(
    frame(renderer.root.findByProps({ testID: "membership-card-foil" }).props.style).opacity,
  ).toBe(foilIntensity.idle);
});
