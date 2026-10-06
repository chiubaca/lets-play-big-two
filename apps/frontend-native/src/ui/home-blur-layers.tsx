import type { ReactNode } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { HOME_SCROLL_EFFECTS } from "./home-scroll-motion";

export function HomeBlurLayers({
  overlap,
  opaque = false,
  children,
}: {
  overlap: Animated.AnimatedInterpolation<number>;
  opaque?: boolean;
  children: (blurRadius: number) => ReactNode;
}) {
  // Static bitmap blur plus native-driven crossfades avoids re-blurring artwork
  // on the JS thread each scroll frame. It approximates CSS's continuous blur.
  const radii = [0, HOME_SCROLL_EFFECTS.blur / 2, HOME_SCROLL_EFFECTS.blur];
  const weights = opaque
    ? [
        [1, 1, 1],
        [0, 1, 1],
        [0, 0, 1],
      ]
    : [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ];
  const blends = weights.map((outputRange) =>
    overlap.interpolate({ inputRange: [0, 0.5, 1], outputRange, extrapolate: "clamp" }),
  );
  const fade = overlap.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1 - HOME_SCROLL_EFFECTS.fade],
  });
  // Account for source-over compositing on the transparent logo, rather than
  // multiplying complementary alphas (which dims the lettering twice).
  // a_i = fade * weight_i / (1 - fade * sum(weights above i)).
  const alphas = opaque
    ? blends
    : blends.map((blend, index) => {
        const above =
          index === 0 ? Animated.add(blends[1]!, blends[2]!) : index === 1 ? blends[2]! : 0;
        return Animated.divide(
          Animated.multiply(fade, blend),
          Animated.subtract(1, Animated.multiply(fade, above)),
        );
      });
  return (
    <View
      pointerEvents="none"
      accessible={false}
      style={opaque ? StyleSheet.absoluteFill : undefined}
    >
      {radii.map((radius, index) => (
        <Animated.View
          key={radius}
          needsOffscreenAlphaCompositing={!opaque}
          style={[
            (index > 0 || opaque) && StyleSheet.absoluteFill,
            {
              opacity: alphas[index]!,
            },
          ]}
        >
          {children(radius)}
        </Animated.View>
      ))}
    </View>
  );
}
