import { getCardKey, type Card } from "@big-two/game-core";
import type { LayoutRectangle } from "react-native";
import { handLayout } from "./hand-layout";

export type CardOrigin = { x: number; y: number; width: number; angle: number };
export type CardMotionSnapshot = {
  pileKey: string;
  userId: string;
  hidden: boolean;
  connected: boolean;
  hand: Card[];
  selected: string[];
  counts: Record<string, number>;
  handFrame?: LayoutRectangle;
  handWidth: number;
  compact: boolean;
  seatFrames: Record<string, LayoutRectangle>;
};

export function pileKey(cards: Card[]) {
  return cards.map(getCardKey).join("|");
}

// Only animate a newly confirmed play, not hydration, a pass, a rejected move or a reconnect.
export function cardPlayOrigins(
  previous: CardMotionSnapshot | undefined,
  current: CardMotionSnapshot,
  cards: Card[],
): Record<string, CardOrigin> {
  if (
    !previous ||
    previous.pileKey === current.pileKey ||
    !cards.length ||
    previous.userId !== current.userId ||
    previous.hidden ||
    current.hidden ||
    !previous.connected ||
    !current.connected
  )
    return {};

  const movers = Object.keys(previous.counts).filter(
    (id) => previous.counts[id]! - (current.counts[id] ?? previous.counts[id]!) === cards.length,
  );
  // Skipped network snapshots may contain several plays; don't invent a source hand.
  const changed = Object.keys(previous.counts).filter(
    (id) => current.counts[id] !== undefined && previous.counts[id] !== current.counts[id],
  );
  if (movers.length !== 1 || changed.length !== 1) return {};
  const mover = movers[0]!;
  const origins: Record<string, CardOrigin> = {};
  if (mover === previous.userId && previous.handFrame) {
    const layout = handLayout(previous.handWidth, previous.hand.length, previous.compact);
    for (const card of cards) {
      const key = getCardKey(card);
      const index = previous.hand.findIndex((entry) => getCardKey(entry) === key);
      if (index < 0 || current.hand.some((entry) => getCardKey(entry) === key)) return {};
      const position = layout.card(index, previous.selected.includes(key));
      const radians = (position.angle * Math.PI) / 180;
      // The fan rotates around the bottom center, while flying cards rotate around their center.
      origins[key] = {
        x:
          previous.handFrame.x +
          position.left +
          layout.cardWidth / 2 +
          (Math.sin(radians) * layout.cardHeight) / 2,
        y:
          previous.handFrame.y +
          position.top +
          layout.cardHeight -
          (Math.cos(radians) * layout.cardHeight) / 2,
        width: layout.cardWidth,
        angle: position.angle,
      };
    }
  } else {
    const frame = previous.seatFrames[mover];
    if (!frame) return {};
    const width = previous.compact ? 23 : 27;
    cards.forEach((card, index) => {
      origins[getCardKey(card)] = {
        x: frame.x + frame.width / 2 + (index - (cards.length - 1) / 2) * 8,
        y: frame.y + frame.height - (width * (37 / 27)) / 2,
        width,
        angle: (index - (cards.length - 1) / 2) * 5,
      };
    });
  }
  return origins;
}
