const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const HOME_SCROLL_EFFECTS = { overlapRatio: 0.85, fade: 0.5, shrink: 0.06, blur: 12 };

export function homeLogoWidth(width: number, height: number) {
  return Math.min(width - 28, clamp(height * 0.52, 300, 500));
}

export function homeStickyTop(height: number) {
  return clamp(height * 0.06, 32, 80);
}

export interface HomeScrollGeometry {
  stageY: number;
  stageHeight: number;
  foregroundY: number;
  containerBottom: number;
  stickyTop: number;
}

// Equivalent to the web's sticky stage and bounding-rectangle overlap calculation.
// Coordinates are in ScrollView content space, not screen/safe-area space.
export function homeScrollMotion(geometry: HomeScrollGeometry) {
  const { stageY, stageHeight, foregroundY, containerBottom, stickyTop } = geometry;
  const pinStart = Math.max(0, stageY - stickyTop);
  const maxTranslate = Math.max(0, containerBottom - stageY - stageHeight);
  const pinEnd = pinStart + maxTranslate;
  const gap = Math.max(0, foregroundY - stageY - stageHeight);
  const overlapStart = pinStart + gap;
  const overlapDistance = Math.max(1, stageHeight * HOME_SCROLL_EFFECTS.overlapRatio);
  const overlapEnd = Math.max(overlapStart + 1, Math.min(pinEnd, overlapStart + overlapDistance));
  const maxOverlap = clamp((maxTranslate - gap) / overlapDistance, 0, 1);
  return { pinStart, pinEnd, maxTranslate, overlapStart, overlapEnd, maxOverlap };
}
