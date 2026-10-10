import { useEffect, useState } from "react";
import { Image, StyleSheet, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { Label } from "./primitives";
import { CardSuit } from "./cards";
import { artwork, colors, fonts } from "./theme";
import { useReducedMotion } from "./use-reduced-motion";

const sparkles = [
  { x: 0.12, y: 0.25, glyph: "♦", pink: false },
  { x: 0.25, y: 0.1, glyph: "✦", pink: false },
  { x: 0.72, y: 0.1, glyph: "♠", pink: false },
  { x: 0.88, y: 0.26, glyph: "✦", pink: false },
  { x: 0.94, y: 0.48, glyph: "♦", pink: true },
  { x: 0.83, y: 0.65, glyph: "✦", pink: false },
  { x: 0.16, y: 0.64, glyph: "♣", pink: false },
  { x: 0.06, y: 0.45, glyph: "✦", pink: true },
];

export function WinnerCelebration() {
  const window = useWindowDimensions();
  const [width, setWidth] = useState(Math.max(180, Math.min(window.width - 76, 240)));
  const reducedMotion = useReducedMotion();
  const reveal = useSharedValue(1);
  const burst = useSharedValue(1);

  useEffect(() => {
    if (reducedMotion) {
      cancelAnimation(reveal);
      cancelAnimation(burst);
      reveal.value = 1;
      burst.value = 1;
      return;
    }
    reveal.value = 0;
    burst.value = 0;
    reveal.value = withTiming(1, {
      duration: 650,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      reduceMotion: ReduceMotion.Never,
    });
    burst.value = withDelay(
      120,
      withTiming(1, {
        duration: 1100,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        reduceMotion: ReduceMotion.Never,
      }),
      ReduceMotion.Never,
    );
    return () => {
      cancelAnimation(reveal);
      cancelAnimation(burst);
    };
  }, [reducedMotion, reveal, burst]);

  const entrance = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [
      { translateY: (1 - reveal.value) * 18 },
      { scale: interpolate(reveal.value, [0, 0.75, 1], [0.84, 1.025, 1]) },
    ],
  }));

  return (
    <View
      testID="winner-celebration"
      style={styles.celebration}
      onLayout={({ nativeEvent }) => {
        if (nativeEvent.layout.width > 0) setWidth(Math.min(nativeEvent.layout.width, 240));
      }}
    >
      <View style={styles.eyebrow}>
        <View style={styles.rule} />
        <Label style={styles.eyebrowText}>THE TABLE IS YOURS</Label>
        <View style={styles.rule} />
      </View>
      <Animated.View
        testID="winner-hero"
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[{ width, height: width * 1.16 }, entrance]}
      >
        <LinearGradient
          colors={["#f8d67e26", "#b38c2510", "#172d1e00"]}
          style={[
            styles.halo,
            {
              width: width * 0.7,
              height: width * 0.7,
              borderRadius: width,
              left: width * 0.15,
              top: width * 0.1,
            },
          ]}
        >
          <View style={styles.innerRing} />
        </LinearGradient>
        {Array.from({ length: 12 }, (_, index) => (
          <View
            key={index}
            style={{
              position: "absolute",
              left: width / 2 - 0.5,
              top: width * 0.45 - 4,
              width: 1,
              height: 8,
              backgroundColor: colors.gold,
              opacity: 0.45,
              transform: [{ rotate: `${index * 30}deg` }, { translateY: -width * 0.31 }],
            }}
          />
        ))}
        {sparkles.map((sparkle, index) => (
          <SuitSparkle key={index} {...sparkle} width={width} progress={burst} />
        ))}
        <Image
          accessible={false}
          source={artwork.spade}
          resizeMode="contain"
          style={{
            position: "absolute",
            width: width * 0.57,
            height: width * 0.57,
            left: width * 0.215,
            top: width * 0.165,
          }}
        />
        <Image
          accessible={false}
          source={artwork.winner}
          resizeMode="contain"
          style={{ position: "absolute", width, height: width * 0.7253, top: width * 0.54 }}
        />
      </Animated.View>
      <Label heading style={styles.winnerName}>
        You won!
      </Label>
      <Label style={styles.caption}>Beautifully played.</Label>
      <View
        style={styles.ornament}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View style={styles.rule} />
        <Label style={styles.diamond}>◆</Label>
        <View style={styles.rule} />
      </View>
    </View>
  );
}

function SuitSparkle({
  x,
  y,
  glyph,
  pink,
  width,
  progress,
}: (typeof sparkles)[number] & { width: number; progress: SharedValue<number> }) {
  const motion = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.25, 0.7, 1], [0, 1, 0.85, 0.65]),
    transform: [
      { translateX: (0.5 - x) * width * (1 - progress.value) },
      { translateY: (0.45 - y) * width * (1 - progress.value) },
      { scale: interpolate(progress.value, [0, 0.4, 1], [0.4, 1.25, 1]) },
      { rotate: `${(1 - progress.value) * (pink ? 70 : -45)}deg` },
    ],
  }));
  return (
    <Animated.View
      testID="winner-sparkle"
      style={[{ position: "absolute", left: x * width - 12, top: y * width - 12 }, motion]}
    >
      {glyph === "✦" ? (
        <Label style={[styles.sparkle, { color: pink ? "#ff65b6" : colors.gold }]}>{glyph}</Label>
      ) : (
        <View style={{ width: 24, height: 26, alignItems: "center", justifyContent: "center" }}>
          <CardSuit
            suit={glyph === "♦" ? "DIAMOND" : glyph === "♠" ? "SPADE" : "CLUB"}
            size={20}
            color={pink ? "#ff65b6" : colors.gold}
          />
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  celebration: { width: "100%", alignItems: "center" },
  eyebrow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  eyebrowText: { color: colors.gold, fontFamily: fonts.strong, fontSize: 10, letterSpacing: 2 },
  rule: { width: 28, height: 1, backgroundColor: "#e9bd6966" },
  halo: {
    position: "absolute",
    borderWidth: 1,
    borderColor: "#e9bd694d",
    boxShadow: "0 0 36px #e9bd691a",
  },
  innerRing: {
    position: "absolute",
    top: 7,
    right: 7,
    bottom: 7,
    left: 7,
    borderRadius: 300,
    borderWidth: 1,
    borderColor: "#e9bd6926",
  },
  sparkle: { fontSize: 20, lineHeight: 26, textAlign: "center", width: 24 },
  winnerName: { textAlign: "center", fontSize: 30, lineHeight: 38, color: colors.gold },
  caption: { textAlign: "center", color: colors.muted, fontSize: 12, marginTop: 4 },
  ornament: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14, marginBottom: 4 },
  diamond: { fontSize: 8, lineHeight: 12, color: colors.gold },
});
