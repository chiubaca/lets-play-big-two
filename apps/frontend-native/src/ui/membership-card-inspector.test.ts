import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { MembershipCardInspector } from "./membership-card-inspector";
import type { MembershipCardBounds, MembershipCardPresentation } from "./membership-card-motion";
import { cancelAnimation, withTiming } from "react-native-reanimated";
import { readAnimatedStyle } from "../test/reanimated";

const device = vi.hoisted(() => ({ width: 900, height: 900, fontScale: 1 }));
const state = vi.hoisted(() => ({
  reduced: false,
  platform: { OS: "android" },
  animations: [] as { value: unknown; config?: unknown; done?: (finished?: boolean) => void }[],
}));
vi.mock("react-native-reanimated", async () => import("../test/reanimated"));
vi.mock("react-native-worklets", async () => import("../test/worklets"));
vi.mock("./use-reduced-motion", () => ({ useReducedMotion: () => state.reduced }));
vi.mock("./primitives", () => ({ Label: "Text", CasinoBackdrop: "CasinoBackdrop" }));
vi.mock("./theme", () => ({ colors: {} }));
vi.mock("lucide-react-native", () => ({ X: "X" }));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 24 }),
}));
vi.mock("react-native", () => ({
  View: "View",
  Modal: "Modal",
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  Platform: state.platform,
  useWindowDimensions: () => device,
  findNodeHandle: () => 1,
  AccessibilityInfo: { setAccessibilityFocus: vi.fn() },
  StyleSheet: { create: (styles: unknown) => styles, absoluteFill: {} },
}));

let renderer: ReactTestRenderer;
const onClose = vi.fn();
const onRestoreFocus = vi.fn();
const renderCard = vi.fn(
  (_close: () => void, _interactive: boolean, _presentation: MembershipCardPresentation) => null,
);
const onReady = vi.fn();
const measureAnchor = vi.fn<(done: (bounds: MembershipCardBounds | null) => void) => void>();
const measureStage =
  vi.fn<(done: (x: number, y: number, width: number, height: number) => void) => void>();
let frameId = 0;
const frames = new Map<number, FrameRequestCallback>();
const props = (visible = true) => ({
  visible,
  size: { width: 440, height: 266 },
  measureAnchor,
  onClose,
  onRestoreFocus,
  onReady,
  renderCard,
});
async function mount() {
  await act(async () => {
    renderer = create(createElement(MembershipCardInspector, props()), {
      createNodeMock: ({ props: node }) =>
        (node as { testID?: string }).testID === "membership-card-zoom"
          ? { measureInWindow: measureStage }
          : {},
    });
  });
}
async function update(visible = true) {
  await act(async () => renderer.update(createElement(MembershipCardInspector, props(visible))));
}
async function close() {
  await act(async () =>
    renderer.root.findAll((node) => String(node.type) === "Modal")[0]!.props.onRequestClose(),
  );
}
async function flushFrame() {
  await act(async () => {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback(0));
  });
}
async function show() {
  await act(async () => {
    renderer.root.findByProps({ testID: "membership-card-zoom" }).props.onLayout();
    renderer.root.findAll((node) => String(node.type) === "Modal")[0]!.props.onShow();
    renderer.root.findAll((node) => String(node.type) === "CasinoBackdrop")[0]!.props.onLoadEnd();
  });
  await flushFrame();
  await flushFrame();
}
const finishReturn = () => state.animations.findLast((animation) => animation.done)!.done!(true);
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  state.reduced = false;
  state.platform.OS = "android";
  state.animations = [];
  vi.mocked(withTiming).mockImplementation((value, config, done) => {
    state.animations.push({ value, config, done });
    return value;
  });
  Object.assign(device, { width: 900, height: 900, fontScale: 1 });
  measureStage.mockImplementation((done) => done(0, 200, 656, 397));
  measureAnchor.mockImplementation((done) => done({ x: 20, y: 80, width: 440, height: 266 }));
  frames.clear();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  vi.unstubAllGlobals();
});

it("remeasures the preview and suspends card motion before returning", async () => {
  await mount();
  await show();
  expect(renderCard.mock.lastCall?.[1]).toBe(true);
  await close();
  expect(measureAnchor).toHaveBeenCalledOnce();
  expect(renderCard.mock.lastCall?.[1]).toBe(false);
  expect(onClose).not.toHaveBeenCalled();
  await act(async () => finishReturn());
  expect(onClose).toHaveBeenCalledOnce();
});

it("keeps Android inspection GPU-accelerated so cached foil textures work inside the modal", async () => {
  await mount();
  const modal = renderer.root.findAll((node) => String(node.type) === "Modal")[0]!;
  expect(modal.props.hardwareAccelerated).toBe(true);
});

it("does not flash a fully opaque backdrop before the modal is ready to unfurl", async () => {
  await mount();
  const backdrop = renderer.root.findAll((node) => String(node.type) === "AnimatedView")[0]!;
  expect(readAnimatedStyle(backdrop.props.style.at(-1)).opacity).toBeLessThanOrEqual(0.001);
  expect(state.animations).toHaveLength(0);
});

it("waits for both layout and modal presentation, warms both faces, then starts the web's 850ms timeline once", async () => {
  await mount();
  const modal = renderer.root.findAll((node) => String(node.type) === "Modal")[0]!;
  await act(async () => modal.props.onShow());
  await flushFrame();
  expect(withTiming).not.toHaveBeenCalled();
  const stage = renderer.root.findByProps({ testID: "membership-card-zoom" });
  expect(readAnimatedStyle(stage.props.style.at(-1)).opacity).toBe(0.001);
  await act(async () => stage.props.onLayout());
  await flushFrame();
  expect(withTiming).not.toHaveBeenCalled();
  await act(async () =>
    renderer.root.findAll((node) => String(node.type) === "CasinoBackdrop")[0]!.props.onLoadEnd(),
  );
  await flushFrame();
  expect(withTiming).not.toHaveBeenCalled();
  await flushFrame();
  expect(withTiming).toHaveBeenCalledExactlyOnceWith(1, {
    duration: 850,
    easing: [0.22, 1, 0.36, 1],
  });
  expect(onReady).toHaveBeenCalledOnce();
  expect(renderCard.mock.lastCall?.[2].ready.value).toBe(true);
  await act(async () => stage.props.onLayout());
  await flushFrame();
  expect(withTiming).toHaveBeenCalledOnce();
});

it("cancels a queued opening when dismissed during warm-up", async () => {
  await mount();
  await act(async () => {
    renderer.root.findByProps({ testID: "membership-card-zoom" }).props.onLayout();
    renderer.root.findAll((node) => String(node.type) === "Modal")[0]!.props.onShow();
    renderer.root.findAll((node) => String(node.type) === "CasinoBackdrop")[0]!.props.onLoadEnd();
  });
  await flushFrame();
  await close();
  await flushFrame();
  expect(onClose).toHaveBeenCalledOnce();
  expect(onReady).not.toHaveBeenCalled();
  expect(withTiming).not.toHaveBeenCalled();
});

it("shows the ready card without an unfurl when Reduce Motion is enabled", async () => {
  state.reduced = true;
  await mount();
  await show();
  expect(onReady).toHaveBeenCalledOnce();
  expect(withTiming).not.toHaveBeenCalled();
  expect(renderCard.mock.lastCall?.[2].progress.value).toBe(1);
  const stage = renderer.root.findByProps({ testID: "membership-card-zoom" });
  expect(readAnimatedStyle(stage.props.style.at(-1)).opacity).toBe(1);
});

it("never resets an in-progress unfurl to the starting angle when closed early", async () => {
  await mount();
  await show();
  const presentation = renderCard.mock.lastCall![2];
  presentation.progress.value = 0.4;
  let poseAtReturn: number | undefined;
  vi.mocked(withTiming).mockImplementation((value, config, done) => {
    poseAtReturn ??= presentation.progress.value;
    state.animations.push({ value, config, done });
    return value;
  });
  await close();
  expect(poseAtReturn).toBe(0.4);
  expect(presentation.ready.value).toBe(true);
  expect(onClose).not.toHaveBeenCalled();
  await act(async () => finishReturn());
  expect(onClose).toHaveBeenCalledOnce();
});

it("ignores a completed return from an older modal presentation", async () => {
  await mount();
  await show();
  await close();
  const oldReturn = state.animations.findLast((animation) => animation.done)!.done!;
  await update(false);
  await update(true);
  await show();
  await act(async () => oldReturn(true));
  expect(onClose).not.toHaveBeenCalled();
  expect(renderCard.mock.lastCall?.[1]).toBe(true);
});

it("returns with an opaque card until the preview hand-off, fading only the backdrop", async () => {
  await mount();
  await show();
  await close();
  const stage = renderer.root.findByProps({ testID: "membership-card-zoom" });
  const style = readAnimatedStyle(stage.props.style.at(-1));
  expect(style).toMatchObject({
    opacity: 1,
    transform: [{ translateX: -88 }, { translateY: -185.5 }, { scale: 266 / 397 }],
  });
  const backdrop = renderer.root.findAll((node) => String(node.type) === "AnimatedView")[0]!;
  expect(readAnimatedStyle(backdrop.props.style.at(-1)).opacity).toBe(0);
  expect(onClose).not.toHaveBeenCalled();
  await act(async () => finishReturn());
  expect(onClose).toHaveBeenCalledOnce();
});

it("ignores a stale measurement after close and reopen", async () => {
  let delayed!: Parameters<typeof measureStage>[0];
  measureStage.mockImplementation((done) => {
    delayed = done;
  });
  await mount();
  await show();
  await close();
  await update(false);
  await update(true);
  await act(async () => delayed(0, 200, 656, 397));
  expect(state.animations.filter((animation) => animation.done)).toHaveLength(0);
  expect(measureAnchor).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
  expect(renderCard.mock.lastCall?.[1]).toBe(true);
});

it("dismisses without animation when either measurement is invalid", async () => {
  measureStage.mockImplementation((done) => done(0, 0, 0, 0));
  await mount();
  await show();
  await close();
  expect(onClose).toHaveBeenCalledOnce();
  expect(state.animations.filter((animation) => animation.done)).toHaveLength(0);
});

it("interrupts an active return when reduced motion is enabled", async () => {
  await mount();
  await show();
  await close();
  const done = state.animations.findLast((animation) => animation.done)!.done!;
  vi.mocked(cancelAnimation).mockClear();
  state.reduced = true;
  await update();
  expect(cancelAnimation).toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledOnce();
  await act(async () => done(true));
  expect(onClose).toHaveBeenCalledOnce();
});

it("restores Android focus only after the hidden modal commits, and cancels restoration on reopen", async () => {
  state.reduced = true;
  await mount();
  await close();
  expect(onRestoreFocus).not.toHaveBeenCalled();
  await update(false);
  await flushFrame();
  await update(true);
  await flushFrame();
  expect(onRestoreFocus).not.toHaveBeenCalled();
  await close();
  await update(false);
  await flushFrame();
  await flushFrame();
  expect(onRestoreFocus).toHaveBeenCalledOnce();
});

it("uses actual iOS modal dismissal to restore focus", async () => {
  state.platform.OS = "ios";
  state.reduced = true;
  await mount();
  await close();
  await update(false);
  expect(frames.size).toBe(0);
  expect(onRestoreFocus).not.toHaveBeenCalled();
  await act(async () =>
    renderer.root.findAll((node) => String(node.type) === "Modal")[0]!.props.onDismiss(),
  );
  expect(onRestoreFocus).toHaveBeenCalledOnce();
});

it("reserves space for a scrollable hint at large font scale in short landscape", async () => {
  Object.assign(device, { width: 844, height: 390, fontScale: 2 });
  await mount();
  const stage = renderer.root.findByProps({ testID: "membership-card-zoom" });
  expect(stage.props.style[0].height).toBeLessThanOrEqual(110);
  expect(renderer.root.findAll((node) => String(node.type) === "ScrollView")).toHaveLength(1);
  expect(
    renderer.root.findAll((node) => String(node.type) === "CasinoBackdrop")[0]!.props.blurRadius,
  ).toBe(18);
});

it("cancels pending animation callbacks on unmount", async () => {
  await mount();
  await show();
  await close();
  const done = state.animations.findLast((animation) => animation.done)!.done!;
  vi.mocked(cancelAnimation).mockClear();
  await act(async () => renderer.unmount());
  expect(cancelAnimation).toHaveBeenCalled();
  done(true);
  expect(onClose).not.toHaveBeenCalled();
});
