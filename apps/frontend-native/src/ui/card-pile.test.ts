import { createElement, type ComponentProps } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import type { Card } from "@big-two/game-core";
import { CardPile } from "./card-pile";
import { cancelAnimation, withDelay, withTiming } from "../test/reanimated";

const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock("react-native", () => ({ View: "View" }));
vi.mock("react-native-reanimated", async () => import("../test/reanimated"));
vi.mock("./cards", () => ({ PlayingCard: "PlayingCard" }));
vi.mock("./use-reduced-motion", () => ({ useReducedMotion: () => motion.reduced }));

const cards: Card[] = [
  { value: "3", suit: "DIAMOND" },
  { value: "3", suit: "CLUB" },
];
const initial = (): ComponentProps<typeof CardPile> => ({
  cards: [],
  width: 48,
  topInset: 17,
  centerFrame: { x: 70, y: 200, width: 250, height: 90 },
  motion: {
    hand: cards,
    selected: ["3:DIAMOND", "3:CLUB"],
    userId: "you",
    hidden: false,
    connected: true,
    handWidth: 360,
    compact: false,
    handFrame: { x: 15, y: 400, width: 360, height: 150 },
    counts: { you: 2, bot: 13 },
    seatFrames: {},
  },
});
const played = (props: ComponentProps<typeof CardPile>): ComponentProps<typeof CardPile> => ({
  ...props,
  cards,
  motion: { ...props.motion, hand: [], selected: [], counts: { you: 0, bot: 13 } },
});
let renderer: ReactTestRenderer;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  motion.reduced = false;
  vi.clearAllMocks();
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
});

it("stagger-glides confirmed cards from the fan with a soft landing easing", async () => {
  const props = initial();
  await act(async () => {
    renderer = create(createElement(CardPile, props));
  });
  vi.clearAllMocks();
  await act(async () => renderer.update(createElement(CardPile, played(props))));
  expect(withDelay.mock.calls.map(([delay]) => delay)).toEqual([0, 18]);
  expect(withTiming).toHaveBeenCalledWith(1, {
    duration: 260,
    easing: [0.22, 1, 0.36, 1],
    reduceMotion: "never",
  });
  const flight = renderer.root.findByProps({ testID: "pile-card-3:DIAMOND" });
  expect(flight.props.style[1].transform[1].translateY).toBeGreaterThan(150);
  expect(flight.props.style[1].transform[3].scale).toBeGreaterThan(1);
  vi.clearAllMocks();
  await act(async () => renderer.update(createElement(CardPile, { ...played(props), width: 50 })));
  expect(withDelay).not.toHaveBeenCalled();
});

it("does not replay a hydrated pile or a pass", async () => {
  const props = played(initial());
  await act(async () => {
    renderer = create(createElement(CardPile, props));
  });
  await act(async () =>
    renderer.update(
      createElement(CardPile, { ...props, motion: { ...props.motion, selected: [] } }),
    ),
  );
  expect(withDelay).not.toHaveBeenCalled();
});

it("lands immediately with reduced motion and cancels an in-flight animation when enabled", async () => {
  const props = initial();
  await act(async () => {
    renderer = create(createElement(CardPile, props));
  });
  motion.reduced = true;
  await act(async () => renderer.update(createElement(CardPile, played(props))));
  expect(withDelay).not.toHaveBeenCalled();
  expect(cancelAnimation).toHaveBeenCalled();
  await act(async () => renderer.unmount());
  motion.reduced = false;
  await act(async () => {
    renderer = create(createElement(CardPile, props));
  });
  await act(async () => renderer.update(createElement(CardPile, played(props))));
  vi.clearAllMocks();
  motion.reduced = true;
  await act(async () => renderer.update(createElement(CardPile, played(props))));
  expect(cancelAnimation).toHaveBeenCalled();
  expect(withDelay).not.toHaveBeenCalled();
});
