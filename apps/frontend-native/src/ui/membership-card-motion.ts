export function membershipCardLight(x: number, y: number, width: number, height: number) {
  "worklet";
  const horizontal = Math.max(0, Math.min(1, x / Math.max(1, width)));
  const vertical = Math.max(0, Math.min(1, y / Math.max(1, height)));
  return {
    x: horizontal,
    y: vertical,
    active: true,
    foilX: 0.35 + horizontal * 0.3,
    foilY: 0.35 + vertical * 0.3,
    rotateX: (0.5 - vertical) * 10,
    rotateY: (horizontal - 0.5) * 10,
  };
}

export function membershipGradient(width: number, height: number, angle: number, scale = 1) {
  "worklet";
  const radians = (angle * Math.PI) / 180;
  const x = Math.sin(radians);
  const y = -Math.cos(radians);
  const half = ((Math.abs(width * x) + Math.abs(height * y)) * scale) / 2;
  return {
    x1: width / 2 - x * half,
    y1: height / 2 - y * half,
    x2: width / 2 + x * half,
    y2: height / 2 + y * half,
    gradientUnits: "userSpaceOnUse" as const,
  };
}

export function membershipInspectionScale(
  card: { width: number; height: number },
  viewport: { width: number; height: number },
  reservedHeight = 160,
) {
  const availableWidth =
    viewport.width <= 600 ? viewport.width - 16 : Math.min(656, viewport.width - 56);
  return Math.min(
    Math.max(1, availableWidth) / Math.max(1, card.width),
    Math.max(1, viewport.height - reservedHeight) / Math.max(1, card.height),
  );
}

export interface MembershipCardBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function membershipCardReturn(target: MembershipCardBounds, source: MembershipCardBounds) {
  if (
    [target, source].some(
      (box) => !Object.values(box).every(Number.isFinite) || box.width <= 0 || box.height <= 0,
    )
  )
    return null;
  return {
    x: target.x + target.width / 2 - (source.x + source.width / 2),
    y: target.y + target.height / 2 - (source.y + source.height / 2),
    scale: Math.min(target.width / source.width, target.height / source.height),
  };
}
import type { SharedValue } from "react-native-reanimated";

export interface MembershipCardPresentation {
  progress: SharedValue<number>;
  ready: SharedValue<boolean>;
}
