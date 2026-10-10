import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { View, type LayoutRectangle } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { getCardKey, type Card } from "@big-two/game-core";
import { PlayingCard } from "./cards";
import { cardPlayOrigins, pileKey, type CardMotionSnapshot } from "./card-play-motion";
import { useReducedMotion } from "./use-reduced-motion";

type Flight = { x: number; y: number; scale: number; angle: number };

export function CardPile({
  cards,
  width,
  centerFrame,
  topInset,
  motion,
}: {
  cards: Card[];
  width: number;
  centerFrame?: LayoutRectangle;
  topInset: number;
  motion: Omit<CardMotionSnapshot, "pileKey">;
}) {
  const key = pileKey(cards);
  const previous = useRef<CardMotionSnapshot | undefined>(undefined);
  const reducedMotion = useReducedMotion();
  // Freeze launch geometry for this play: selection clearing and hand reflow must not restart it.
  const flights = useMemo(() => {
    const origins = cardPlayOrigins(previous.current, { ...motion, pileKey: key }, cards);
    const result: Record<string, Flight> = {};
    if (centerFrame) {
      cards.forEach((card, index) => {
        const origin = origins[getCardKey(card)];
        if (!origin) return;
        result[getCardKey(card)] = {
          x:
            origin.x -
            (centerFrame.x +
              centerFrame.width / 2 +
              (index - (cards.length - 1) / 2) * (width - 8)),
          y: origin.y - (centerFrame.y + topInset + (width * 1.48) / 2),
          scale: origin.width / width,
          angle: origin.angle,
        };
      });
    }
    return result;
  }, [key, motion.userId, motion.hidden, motion.connected]);
  useLayoutEffect(() => {
    previous.current = { ...motion, pileKey: key };
  });

  return (
    <View
      testID="table-card-pile"
      pointerEvents="none"
      style={{
        width: cards.length ? width + (cards.length - 1) * (width - 8) : 0,
        height: width * 1.48,
        marginTop: 5,
      }}
    >
      {cards.map((card, index) => (
        <PileCard
          key={`${key}:${getCardKey(card)}`}
          card={card}
          width={width}
          index={index}
          angle={(index - (cards.length - 1) / 2) * 4}
          flight={flights[getCardKey(card)]}
          reducedMotion={reducedMotion}
        />
      ))}
    </View>
  );
}

function PileCard({
  card,
  width,
  index,
  angle,
  flight,
  reducedMotion,
}: {
  card: Card;
  width: number;
  index: number;
  angle: number;
  flight?: Flight;
  reducedMotion: boolean;
}) {
  const progress = useSharedValue(flight && !reducedMotion ? 0 : 1);
  useEffect(() => {
    if (!flight || reducedMotion) {
      cancelAnimation(progress);
      progress.value = 1;
      return;
    }
    progress.value = withDelay(
      index * 18,
      withTiming(1, {
        duration: 260,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        reduceMotion: ReduceMotion.Never,
      }),
      ReduceMotion.Never,
    );
    return () => cancelAnimation(progress);
  }, [flight, reducedMotion, index, progress]);
  const motionStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const arc = flight ? Math.min(32, Math.hypot(flight.x, flight.y) * 0.08) : 0;
    return {
      transform: [
        { translateX: (flight?.x ?? 0) * (1 - p) },
        { translateY: (flight?.y ?? 0) * (1 - p) - Math.sin(p * Math.PI) * arc },
        { rotate: `${(flight?.angle ?? angle) + (angle - (flight?.angle ?? angle)) * p}deg` },
        { scale: flight ? interpolate(p, [0, 0.82, 1], [flight.scale, 0.97, 1]) : 1 },
      ],
    };
  });
  return (
    <Animated.View
      testID={`pile-card-${getCardKey(card)}`}
      style={[{ position: "absolute", left: index * (width - 8), top: 0 }, motionStyle]}
    >
      <PlayingCard card={card} width={width} />
    </Animated.View>
  );
}
