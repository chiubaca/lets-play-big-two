import { useState } from "react";
import { vi } from "vite-plus/test";

export default {
  View: "AnimatedView",
  createAnimatedComponent: (component: unknown) => component,
};
export const ReduceMotion = { Always: "always", Never: "never", System: "system" };
export const Easing = { bezier: (...points: number[]) => points };
export const withSpring = vi.fn((value: number, _config?: unknown) => value);
export const withTiming = vi.fn((value: number, _config?: unknown) => value);
export const withDelay = vi.fn((_delay: number, value: number, _reduceMotion?: unknown) => value);
export const cancelAnimation = vi.fn();
export const useSharedValue = (value: number) => useState(() => ({ value }))[0];
export const useAnimatedStyle = (style: () => unknown) => style();
export const interpolateColor = (value: number, _range: number[], colors: string[]) =>
  colors[value > 0 ? colors.length - 1 : 0];
export function interpolate(value: number, input: number[], output: number[]) {
  const next = input.findIndex((point) => point >= value);
  if (next <= 0) return output[next < 0 ? output.length - 1 : 0];
  const progress = (value - input[next - 1]!) / (input[next]! - input[next - 1]!);
  return output[next - 1]! + progress * (output[next]! - output[next - 1]!);
}
