import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import type { GestureResponderEvent } from "react-native";
import type { GestureTouchEvent } from "react-native-gesture-handler";
import { cancelAnimation, withTiming } from "react-native-reanimated";
import { readAnimatedStyle } from "../test/reanimated";
import { useMembershipCardMotion } from "./use-membership-card-motion";
import { restingCardLight } from "./membership-card-holography";
import type { ViewStyle } from "react-native";
import type { MembershipCardPresentation } from "./membership-card-motion";

const state = vi.hoisted(() => ({ reduced: false }));
vi.mock("./use-reduced-motion", () => ({ useReducedMotion: () => state.reduced }));
vi.mock("react-native-reanimated", async () => import("../test/reanimated"));
vi.mock("react-native-gesture-handler", async () => import("../test/gesture-handler"));

let renderer: ReactTestRenderer;
let motion: ReturnType<typeof useMembershipCardMotion>;
let renders = 0;
function Fixture({
  enabled = true,
  enlarged = false,
  presentation,
}: {
  enabled?: boolean;
  enlarged?: boolean;
  presentation?: MembershipCardPresentation;
}) {
  renders += 1;
  motion = useMembershipCardMotion({ enabled, enlarged, width: 400, height: 200, presentation });
  return null;
}
const touch = (pageX: number, pageY: number) =>
  ({ nativeEvent: { pageX, pageY } }) as GestureResponderEvent;
const nativeTouch = (x: number, y: number) =>
  ({
    allTouches: [{ id: 0, x, y, absoluteX: x + 20, absoluteY: y + 40 }],
  }) as GestureTouchEvent;
const manager = { handlerTag: 1, fail: vi.fn(), begin: vi.fn(), activate: vi.fn(), end: vi.fn() };
async function mount(props = {}) {
  await act(async () => {
    renderer = create(createElement(Fixture, props));
  });
}
const move = (x: number, y: number) =>
  motion.gesture.handlers.onTouchesMove!(nativeTouch(x, y), manager);
const begin = (x: number, y: number) =>
  motion.gesture.handlers.onTouchesDown!(nativeTouch(x, y), manager);
const finalize = () => motion.gesture.handlers.onFinalize!({} as never, false);

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  state.reduced = false;
  renders = 0;
  vi.clearAllMocks();
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  vi.useRealTimers();
});

it("does not re-render the card on each shimmer frame", async () => {
  await mount();
  const initialRenders = renders;
  await act(async () => {
    motion.handlers.onTouchStart(touch(220, 140));
    begin(200, 100);
  });
  for (let index = 0; index < 60; index += 1) {
    await act(async () => {
      motion.handlers.onTouchMove(touch(220 + index * 3, 140));
      move(200 + index * 3, 100);
    });
  }
  expect(renders).toBe(initialRenders);
  expect(motion.light.value).toMatchObject({ x: 0.9425, y: 0.5, active: true });
});

it("updates native lighting and tilt directly without claiming scrolling", async () => {
  await mount();
  await act(async () => {
    begin(200, 100);
    move(400, 200);
  });
  expect(motion.light.value).toMatchObject({ x: 1, y: 1, active: true });
  expect(motion.light.value.foilX).toBeCloseTo(0.65);
  expect(motion.light.value.foilY).toBeCloseTo(0.65);
  expect(readAnimatedStyle(motion.frontStyle) as ViewStyle).toMatchObject({
    transform: expect.arrayContaining([{ rotateX: "-5deg" }, { rotateY: "5deg" }]),
  });
  expect(motion.gesture.config.shouldCancelWhenOutside).toBe(false);
  expect(manager.activate).not.toHaveBeenCalled();
  expect(motion.handlers).not.toHaveProperty("onStartShouldSetResponder");
  const heldLight = motion.light.value;
  await act(async () => {
    motion.gesture.handlers.onTouchesCancelled!(nativeTouch(400, 200), manager);
    finalize();
  });
  expect(manager.fail).toHaveBeenCalledOnce();
  expect(motion.light.value).toEqual({ ...heldLight, active: false });
  expect(motion.intensity.value).toBe(0);
  expect(withTiming).toHaveBeenCalledWith(0, expect.objectContaining({ duration: 650 }));
  expect(withTiming).toHaveBeenCalledWith(0, { duration: 450 });
});

it.each([{ enabled: false }, { reduced: true }])(
  "keeps disabled/reduced-motion cards static: %j",
  async (options) => {
    state.reduced = "reduced" in options;
    await mount({ enabled: "enabled" in options ? options.enabled : true, enlarged: true });
    expect(motion.gesture.config.enabled).toBe(false);
    expect(withTiming).not.toHaveBeenCalled();
    expect(motion.light.value).toEqual(restingCardLight);
  },
);

it("cancels all UI-thread animations when the inspected card unmounts", async () => {
  await mount({ enlarged: true });
  expect(withTiming).not.toHaveBeenCalled();
  await act(async () => {
    begin(400, 200);
    finalize();
  });
  vi.mocked(cancelAnimation).mockClear();
  await act(async () => renderer.unmount());
  expect(cancelAnimation).toHaveBeenCalledTimes(3);
});

it("uses card-local touch coordinates so uniform inspection scale does not skew lighting", async () => {
  await mount({ enlarged: true });
  const event = nativeTouch(200, 100);
  event.allTouches[0]!.absoluteX = 320;
  event.allTouches[0]!.absoluteY = 190;
  await act(async () => motion.gesture.handlers.onTouchesDown!(event, manager));
  expect(motion.light.value).toEqual({ x: 0.5, y: 0.5, foilX: 0.5, foilY: 0.5, active: true });
});

it("settles tilt without snapping the lighting position when the inspector starts returning", async () => {
  await mount({ enlarged: true });
  await act(async () => begin(400, 200));
  await act(async () =>
    renderer.update(createElement(Fixture, { enlarged: true, enabled: false })),
  );
  expect(motion.gesture.config.enabled).toBe(false);
  expect(motion.light.value).toMatchObject({ x: 1, y: 1, active: false });
  expect(motion.intensity.value).toBe(0);
  expect(readAnimatedStyle(motion.frontStyle) as ViewStyle).toMatchObject({
    transform: expect.arrayContaining([{ rotateX: "0deg" }, { rotateY: "0deg" }, { scale: 1 }]),
  });
});

it("stops the hidden preview instead of running another release animation underneath the modal", async () => {
  await mount();
  await act(async () => begin(400, 200));
  vi.mocked(withTiming).mockClear();
  await act(async () => renderer.update(createElement(Fixture, { enabled: false })));
  expect(withTiming).not.toHaveBeenCalled();
  expect(motion.light.value).toEqual(restingCardLight);
  expect(motion.intensity.value).toBe(0);
});

it("samples the same inspector timeline for both faces instead of starting an unfurl on mount", async () => {
  const presentation = {
    progress: { value: 1 },
    ready: { value: false },
  } as MembershipCardPresentation;
  await mount({ enlarged: true, presentation });
  expect(withTiming).not.toHaveBeenCalled();
  expect(readAnimatedStyle(motion.backStyle) as ViewStyle).toMatchObject({
    transform: expect.arrayContaining([{ rotateY: "0deg" }]),
  });
  presentation.ready.value = true;
  presentation.progress.value = 0.4;
  expect(readAnimatedStyle(motion.frontStyle) as ViewStyle).toMatchObject({
    transform: expect.arrayContaining([{ rotateY: "-180deg" }]),
  });
  expect(readAnimatedStyle(motion.backStyle) as ViewStyle).toMatchObject({
    transform: expect.arrayContaining([{ rotateY: "0deg" }]),
  });
  await act(async () =>
    renderer.update(createElement(Fixture, { enabled: false, enlarged: true, presentation })),
  );
  expect(presentation.progress.value).toBe(0.4);
});

it("does not treat a foil drag as a tap, but permits later keyboard/screen-reader activation", async () => {
  vi.useFakeTimers();
  await mount();
  await act(async () => {
    motion.handlers.onTouchStart(touch(220, 140));
    motion.handlers.onTouchMove(touch(280, 140));
    motion.handlers.onTouchEnd();
  });
  expect(motion.shouldActivate()).toBe(false);
  await act(async () => {
    vi.runOnlyPendingTimers();
  });
  expect(motion.shouldActivate()).toBe(true);
});

it("cleans up the deferred press guard when the card unmounts", async () => {
  vi.useFakeTimers();
  await mount();
  await act(async () => motion.handlers.onTouchEnd());
  expect(vi.getTimerCount()).toBe(1);
  await act(async () => renderer.unmount());
  expect(vi.getTimerCount()).toBe(0);
});
