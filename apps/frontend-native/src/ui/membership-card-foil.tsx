import { memo, useId } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import {
  Circle,
  Defs,
  LinearGradient,
  Mask,
  Pattern,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import { MembershipCardTexture } from "./membership-card-texture";
import {
  foilStops,
  foilIntensity,
  glareIntensity,
  membershipFoilGeometry,
  metalStops,
  restingCardLight,
  type MembershipCardLighting,
} from "./membership-card-holography";

type Field = "rainbow" | "metal" | "reflection";
const fieldScale = (field: Field) => (field === "rainbow" ? 3.5 : 2.5);

// Cache just the visible field plus maximum movement, not a 350%-sized bitmap.
const FieldTexture = memo(function FieldTexture({
  width,
  height,
  field,
}: {
  width: number;
  height: number;
  field: Field;
}) {
  const id = useId().replace(/:/g, "");
  const gradient = membershipFoilGeometry(width, height, restingCardLight)[field];
  const margin = (fieldScale(field) - 1) * 0.15;
  const x = width * margin;
  const y = height * margin;
  const stops =
    field === "rainbow"
      ? foilStops
      : field === "metal"
        ? metalStops
        : [
            { offset: 0.3, color: "#fff", opacity: 0 },
            { offset: 0.43, color: "#fff", opacity: 0.04 },
            { offset: 0.48, color: "#fff", opacity: 0.27 },
            { offset: 0.53, color: "#fff", opacity: 0.04 },
            { offset: 0.65, color: "#fff", opacity: 0 },
          ];
  return (
    <MembershipCardTexture
      cacheKey={`field:${field}:${width}:${height}`}
      width="100%"
      height="100%"
      viewBox={`${-x} ${-y} ${width + x * 2} ${height + y * 2}`}
    >
      <Defs>
        <LinearGradient id={`${id}-field`} {...gradient}>
          {stops.map((stop) => (
            <Stop
              key={stop.offset}
              offset={stop.offset}
              stopColor={stop.color}
              stopOpacity={"opacity" in stop ? stop.opacity : 1}
            />
          ))}
        </LinearGradient>
      </Defs>
      <Rect
        x={-x}
        y={-y}
        width={width + x * 2}
        height={height + y * 2}
        fill={`url(#${id}-field)`}
      />
    </MembershipCardTexture>
  );
});

function MovingField({
  width,
  height,
  field,
  light,
}: {
  width: number;
  height: number;
  field: Field;
  light: SharedValue<MembershipCardLighting>;
}) {
  const scale = fieldScale(field);
  const margin = (scale - 1) * 0.15;
  const motion = useAnimatedStyle(() => ({
    transform: [
      { translateX: width * (1 - scale) * (light.value.foilX - 0.5) },
      { translateY: height * (1 - scale) * (light.value.foilY - 0.5) },
    ],
  }));
  return (
    <Animated.View
      testID={`membership-card-${field}-field`}
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          left: -width * margin,
          top: -height * margin,
          width: width * (1 + 2 * margin),
          height: height * (1 + 2 * margin),
        },
        motion,
      ]}
    >
      <FieldTexture width={width} height={height} field={field} />
    </Animated.View>
  );
}

// Soft radial light can be transformed from a small cached texture. Scaling the
// native wrapper preserves card-space radii without invalidating the SVG bitmap.
const LightTexture = memo(function LightTexture({
  radius,
  glare,
}: {
  radius: number;
  glare: boolean;
}) {
  const id = useId().replace(/:/g, "");
  return (
    <MembershipCardTexture
      cacheKey={`light:${glare}:${radius}`}
      width="100%"
      height="100%"
      viewBox={`0 0 ${radius * 2} ${radius * 2}`}
    >
      <Defs>
        <RadialGradient
          id={`${id}-light`}
          cx={radius}
          cy={radius}
          rx={radius}
          ry={radius}
          gradientUnits="userSpaceOnUse"
        >
          {(glare
            ? [
                { offset: 0, color: "#fff8dd", opacity: 0.4 },
                { offset: 0.55, color: "#fff8dd", opacity: 0 },
              ]
            : [
                { offset: 0, color: "#fff", opacity: 0.7 },
                { offset: 0.35, color: "#fff", opacity: 0.04 },
                { offset: 0.85, color: "#000", opacity: 0.6 },
              ]
          ).map((stop) => (
            <Stop
              key={stop.offset}
              offset={stop.offset}
              stopColor={stop.color}
              stopOpacity={stop.opacity}
            />
          ))}
        </RadialGradient>
      </Defs>
      <Rect width={radius * 2} height={radius * 2} fill={`url(#${id}-light)`} />
    </MembershipCardTexture>
  );
});

function MovingLight({
  width,
  height,
  light,
  glare = false,
}: {
  width: number;
  height: number;
  light: SharedValue<MembershipCardLighting>;
  glare?: boolean;
}) {
  const radius = Math.min(width, height) / 2;
  const motion = useAnimatedStyle(() => {
    const position = light.value;
    const lightRadius = Math.hypot(
      width * Math.max(position.x, 1 - position.x),
      height * Math.max(position.y, 1 - position.y),
    );
    return {
      transform: [
        { translateX: width * position.x },
        { translateY: height * position.y },
        { scaleX: (glare ? width * 0.65 : lightRadius) / radius },
        { scaleY: (glare ? height * 0.75 : lightRadius) / radius },
      ],
    };
  });
  return (
    <Animated.View
      testID={glare ? "membership-card-glare-light" : "membership-card-foil-light"}
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          left: -radius,
          top: -radius,
          width: radius * 2,
          height: radius * 2,
        },
        motion,
      ]}
    >
      <LightTexture radius={radius} glare={glare} />
    </Animated.View>
  );
}

// Separate native blend surfaces reproduce the web's material without raster filters
// on each touch frame. Only the watermark is spade-masked; these layers cover the card.
export const MembershipCardFoil = memo(function MembershipCardFoil({
  width,
  height,
  light,
  intensity,
}: {
  width: number;
  height: number;
  light: SharedValue<MembershipCardLighting>;
  intensity: SharedValue<number>;
}) {
  const foilStyle = useAnimatedStyle(() => ({
    opacity: foilIntensity.idle + (foilIntensity.active - foilIntensity.idle) * intensity.value,
  }));
  const glareStyle = useAnimatedStyle(() => ({
    opacity: glareIntensity.idle + (glareIntensity.active - glareIntensity.idle) * intensity.value,
  }));

  return (
    <>
      <Animated.View
        testID="membership-card-foil"
        pointerEvents="none"
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={[styles.surface, { mixBlendMode: "color-dodge" }, foilStyle]}
      >
        <MovingField width={width} height={height} light={light} field="rainbow" />
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { mixBlendMode: "soft-light" }]}
        >
          <MovingField width={width} height={height} light={light} field="metal" />
        </View>
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { mixBlendMode: "screen" }]}>
          <MovingLight width={width} height={height} light={light} />
        </View>
      </Animated.View>
      <Animated.View
        testID="membership-card-glare"
        pointerEvents="none"
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={[styles.surface, { mixBlendMode: "screen" }, glareStyle]}
      >
        <MovingLight width={width} height={height} light={light} glare />
        <MovingField width={width} height={height} light={light} field="reflection" />
        <SparkleTexture width={width} height={height} />
      </Animated.View>
    </>
  );
});

// Sparkles are subtle surface grain, not a live SVG mask. Cache them once; the
// moving radial light and shared intensity provide the changing illumination.
const SparkleTexture = memo(function SparkleTexture({
  width,
  height,
}: {
  width: number;
  height: number;
}) {
  const id = useId().replace(/:/g, "");
  const geometry = membershipFoilGeometry(width, height, restingCardLight);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <MembershipCardTexture
        cacheKey={`sparkles:${width}:${height}`}
        width="100%"
        height="100%"
        viewBox={`0 0 ${width} ${height}`}
      >
        <Defs>
          <Pattern id={`${id}-gold-dots`} width="19" height="23" patternUnits="userSpaceOnUse">
            <Circle cx="0" cy="0" r="0.6" fill="#fff5cb" fillOpacity="0.8" />
          </Pattern>
          <Pattern
            id={`${id}-cyan-dots`}
            x="7"
            y="11"
            width="31"
            height="37"
            patternUnits="userSpaceOnUse"
          >
            <Circle cx="0" cy="0" r="0.5" fill="#b3fff6" fillOpacity="0.73" />
          </Pattern>
          <RadialGradient
            id={`${id}-sparkle-light`}
            cx={geometry.lightX}
            cy={geometry.lightY}
            rx={width}
            ry={height}
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0" stopColor="#fff" />
            <Stop offset="0.65" stopColor="#fff" stopOpacity="0" />
          </RadialGradient>
          <Mask
            id={`${id}-sparkles`}
            maskType="alpha"
            maskUnits="userSpaceOnUse"
            maskContentUnits="userSpaceOnUse"
            width={width}
            height={height}
          >
            <Rect width={width} height={height} fill={`url(#${id}-sparkle-light)`} />
          </Mask>
        </Defs>
        <Rect
          width={width}
          height={height}
          fill={`url(#${id}-gold-dots)`}
          opacity="0.45"
          mask={`url(#${id}-sparkles)`}
        />
        <Rect
          width={width}
          height={height}
          fill={`url(#${id}-cyan-dots)`}
          opacity="0.45"
          mask={`url(#${id}-sparkles)`}
        />
      </MembershipCardTexture>
    </View>
  );
});

const styles = StyleSheet.create({
  surface: { ...StyleSheet.absoluteFill, zIndex: 1, overflow: "hidden" },
});
