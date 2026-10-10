import { describe, expect, it } from "vite-plus/test";
import { getCardKey, type Card } from "@big-two/game-core";
import { cardPlayOrigins, pileKey, type CardMotionSnapshot } from "./card-play-motion";
import { handLayout } from "./hand-layout";

const three: Card = { value: "3", suit: "DIAMOND" };
const four: Card = { value: "4", suit: "CLUB" };
const before = (changes: Partial<CardMotionSnapshot> = {}): CardMotionSnapshot => ({
  pileKey: "",
  userId: "you",
  hidden: false,
  connected: true,
  hand: [three, four],
  selected: [getCardKey(three)],
  counts: { you: 2, bot: 13 },
  handFrame: { x: 15, y: 400, width: 360, height: 150 },
  handWidth: 360,
  compact: false,
  seatFrames: { bot: { x: 140, y: 12, width: 110, height: 90 } },
  ...changes,
});
const after = (changes: Partial<CardMotionSnapshot> = {}) =>
  before({
    pileKey: pileKey([three]),
    hand: [four],
    selected: [],
    counts: { you: 1, bot: 13 },
    ...changes,
  });

describe("confirmed card flight origins", () => {
  it.each([false, true])(
    "starts from the selected fan card's rotated center (compact=%s)",
    (compact) => {
      const previous = before({ compact });
      const origin = cardPlayOrigins(previous, after(), [three])[getCardKey(three)]!;
      const layout = handLayout(360, 2, compact);
      const position = layout.card(0, true);
      const angle = (position.angle * Math.PI) / 180;
      expect(origin.x).toBeCloseTo(
        15 + position.left + layout.cardWidth / 2 + (Math.sin(angle) * layout.cardHeight) / 2,
      );
      expect(origin.y).toBeCloseTo(
        400 + position.top + layout.cardHeight - (Math.cos(angle) * layout.cardHeight) / 2,
      );
      expect(origin.width).toBe(layout.cardWidth);
      expect(origin.angle).toBe(position.angle);
    },
  );

  it("uses displayed sort order and each card's selection, including multi-card plays", () => {
    const previous = before({ hand: [four, three] });
    const origins = cardPlayOrigins(
      previous,
      after({ hand: [], counts: { you: 0, bot: 13 }, pileKey: pileKey([three, four]) }),
      [three, four],
    );
    expect(origins[getCardKey(three)]!.x).toBeGreaterThan(origins[getCardKey(four)]!.x);
    expect(origins[getCardKey(three)]!.y).toBeLessThan(origins[getCardKey(four)]!.y);
  });

  it("uses public opponent card counts and card-back geometry, not private hands", () => {
    const origins = cardPlayOrigins(
      before({ hand: [] }),
      after({ hand: [], counts: { you: 2, bot: 12 } }),
      [three],
    );
    expect(origins[getCardKey(three)]).toEqual({ x: 195, y: 83.5, width: 27, angle: 0 });
  });

  it("does not animate initial state, passes, unconfirmed or rejected moves", () => {
    expect(cardPlayOrigins(undefined, after(), [three])).toEqual({});
    expect(cardPlayOrigins(after(), after(), [three])).toEqual({});
    expect(cardPlayOrigins(before(), after({ counts: { you: 2, bot: 13 } }), [three])).toEqual({});
    expect(cardPlayOrigins(before(), after({ hand: [three, four] }), [three])).toEqual({});
    expect(cardPlayOrigins(before(), after(), [])).toEqual({});
  });

  it.each([{ hidden: true }, { connected: false }, { userId: "other" }])(
    "does not replay movement across privacy or connection boundaries: %j",
    (changes) => {
      expect(cardPlayOrigins(before(), after(changes), [three])).toEqual({});
      expect(cardPlayOrigins(before(changes), after(), [three])).toEqual({});
    },
  );

  it("does not invent a launch origin when measurements or network turns were skipped", () => {
    expect(cardPlayOrigins(before({ handFrame: undefined }), after(), [three])).toEqual({});
    expect(cardPlayOrigins(before(), after({ counts: { you: 1, bot: 12 } }), [three])).toEqual({});
    expect(
      cardPlayOrigins(before({ seatFrames: {} }), after({ counts: { you: 2, bot: 12 } }), [three]),
    ).toEqual({});
  });
});
