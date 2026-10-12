import { useEffect, useMemo, useRef } from "react";
import type { GestureResponderEvent } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { membershipCardLight, type MembershipCardPresentation } from "./membership-card-motion";
import { useReducedMotion } from "./use-reduced-motion";
import { restingCardLight } from "./membership-card-holography";

export function useMembershipCardMotion({
  enabled,
  enlarged,
  width,
  height,
  presentation,
}: {
  enabled: boolean;
  enlarged: boolean;
  width: number;
  height: number;
  presentation?: MembershipCardPresentation;
}) {
  const reducedMotion = useReducedMotion();
  const light = useSharedValue(restingCardLight);
  const intensity = useSharedValue(0);
  const rotateX = useSharedValue(0);
  const rotateY = useSharedValue(0);
  const restingIntro = useSharedValue(1);
  const intro = presentation?.progress ?? restingIntro;
  const wasEnabled = useRef(enabled);
  const startPoint = useRef({ x: 0, y: 0 });
  const dragged = useRef(false);
  const pressReset = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled || reducedMotion) {
      cancelAnimation(intensity);
      cancelAnimation(rotateX);
      cancelAnimation(rotateY);
      if (enlarged && !reducedMotion && wasEnabled.current && !enabled) {
        // Settle from the current pose instead of snapping flat on modal close.
        light.value = { ...light.value, active: false };
        intensity.value = withTiming(0, { duration: 450 });
        const settle = { duration: 650, easing: Easing.bezier(0.22, 1, 0.36, 1) };
        rotateX.value = withTiming(0, settle);
        rotateY.value = withTiming(0, settle);
      } else {
        light.value = restingCardLight;
        intensity.value = 0;
        rotateX.value = 0;
        rotateY.value = 0;
      }
    }
    wasEnabled.current = enabled;
    return () => {
      cancelAnimation(intensity);
      cancelAnimation(rotateX);
      cancelAnimation(rotateY);
    };
  }, [enabled, enlarged, reducedMotion, light, intensity, rotateX, rotateY]);

  useEffect(
    () => () => {
      if (pressReset.current !== null) clearTimeout(pressReset.current);
    },
    [],
  );

  const gesture = useMemo(() => {
    const move = (x: number, y: number) => {
      "worklet";
      const position = membershipCardLight(x, y, width, height);
      light.value = {
        x: position.x,
        y: position.y,
        foilX: position.foilX,
        foilY: position.foilY,
        active: true,
      };
      rotateX.value = position.rotateX;
      rotateY.value = position.rotateY;
    };
    // Observe native touches without activating a recognizer: scrolling and the
    // name/emoji Pressables keep their normal ownership of the gesture.
    return Gesture.Manual()
      .enabled(enabled && !reducedMotion)
      .shouldCancelWhenOutside(false)
      .onTouchesDown((event) => {
        "worklet";
        const touch = event.allTouches[0];
        if (!touch) return;
        cancelAnimation(rotateX);
        cancelAnimation(rotateY);
        move(touch.x, touch.y);
        intensity.value = withTiming(1, { duration: 150 });
      })
      .onTouchesMove((event) => {
        "worklet";
        const touch = event.allTouches[0];
        if (touch) move(touch.x, touch.y);
      })
      .onTouchesUp((_event, manager) => {
        "worklet";
        manager.fail();
      })
      .onTouchesCancelled((_event, manager) => {
        "worklet";
        manager.fail();
      })
      .onFinalize(() => {
        "worklet";
        light.value = { ...light.value, active: false };
        intensity.value = withTiming(0, { duration: 450 });
        const settle = { duration: 650, easing: Easing.bezier(0.22, 1, 0.36, 1) };
        rotateX.value = withTiming(0, settle);
        rotateY.value = withTiming(0, settle);
      });
  }, [enabled, reducedMotion, width, height, light, intensity, rotateX, rotateY]);

  const frontStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, intro.value / 0.35),
    transform: [
      { perspective: enlarged ? 1200 : 900 },
      { rotateX: `${rotateX.value}deg` },
      { rotateY: `${rotateY.value - 300 * (1 - intro.value)}deg` },
      { rotateZ: `${-12 * (1 - intro.value)}deg` },
      { scale: 0.6 + 0.4 * intro.value },
    ],
  }));
  const backStyle = useAnimatedStyle(() => ({
    opacity: presentation && !presentation.ready.value ? 0.001 : Math.min(1, intro.value / 0.35),
    transform: [
      { perspective: enlarged ? 1200 : 900 },
      { rotateX: `${rotateX.value}deg` },
      // Draw both faces once during warm-up, before the visible 3D turn.
      {
        rotateY: `${presentation && !presentation.ready.value ? 0 : rotateY.value - 300 * (1 - intro.value) + 180}deg`,
      },
      { rotateZ: `${-12 * (1 - intro.value)}deg` },
      { scale: 0.6 + 0.4 * intro.value },
    ],
  }));

  const releasePress = () => {
    // Pressability releases in this event turn. Suppress a drag's click, then
    // allow subsequent keyboard/screen-reader activation as before.
    if (pressReset.current !== null) clearTimeout(pressReset.current);
    pressReset.current = setTimeout(() => {
      dragged.current = false;
      pressReset.current = null;
    }, 0);
  };
  return {
    light,
    intensity,
    gesture,
    reducedMotion,
    shouldActivate: () => !dragged.current,
    frontStyle,
    backStyle,
    // JS only guards presses. No state, measurement, or animation work per move.
    handlers: {
      onTouchStart: ({ nativeEvent: { pageX, pageY } }: GestureResponderEvent) => {
        if (pressReset.current !== null) clearTimeout(pressReset.current);
        pressReset.current = null;
        dragged.current = false;
        startPoint.current = { x: pageX, y: pageY };
      },
      onTouchMove: ({ nativeEvent: { pageX, pageY } }: GestureResponderEvent) => {
        if (Math.hypot(pageX - startPoint.current.x, pageY - startPoint.current.y) > 8)
          dragged.current = true;
      },
      onTouchEnd: releasePress,
      onTouchCancel: releasePress,
    },
  };
}
