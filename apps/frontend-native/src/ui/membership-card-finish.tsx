import { memo, useId } from "react";
import { StyleSheet, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  FeColorMatrix,
  Filter,
  G,
  Image,
  Line,
  LinearGradient,
  Mask,
  Path,
  Pattern,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import { membershipArtwork as artwork } from "./theme";
import { membershipGradient } from "./membership-card-motion";
import { MembershipCardTexture } from "./membership-card-texture";

// The web card's material layers, using the same spade alpha mask and brand artwork.
export const MembershipCardFinish = memo(function MembershipCardFinish({
  width,
  height,
  narrow,
  holographic = true,
}: {
  width: number;
  height: number;
  narrow: boolean;
  holographic?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const watermark = narrow ? 132 : 164;
  const markX = width - watermark - (narrow ? 20 : 26);
  const markY = narrow ? 65 : 48;
  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      <MembershipCardTexture
        cacheKey={`finish:${width}:${height}`}
        width="100%"
        height="100%"
        viewBox={`0 0 ${width} ${height}`}
      >
        <Defs>
          <LinearGradient id={`${id}-base`} {...membershipGradient(width, height, 120)}>
            <Stop offset="0" stopColor="#10291f" />
            <Stop offset="0.55" stopColor="#071b15" />
            <Stop offset="1" stopColor="#153c2d" />
          </LinearGradient>
          <RadialGradient
            id={`${id}-bloom`}
            cx="0"
            cy="0"
            rx={width * Math.SQRT2}
            ry={height * Math.SQRT2}
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0" stopColor="#355c42" />
            <Stop offset="0.65" stopColor="#355c42" stopOpacity="0" />
          </RadialGradient>
          <LinearGradient
            id={`${id}-fade`}
            x1="0"
            y1="0"
            x2={width}
            y2="0"
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0.25" stopColor="#fff" stopOpacity="0" />
            <Stop offset="1" stopColor="#fff" />
          </LinearGradient>
          <Mask
            id={`${id}-security`}
            maskType="alpha"
            maskUnits="userSpaceOnUse"
            maskContentUnits="userSpaceOnUse"
            width={width}
            height={height}
          >
            <Rect width={width} height={height} fill={`url(#${id}-fade)`} />
          </Mask>
          <LinearGradient
            id={`${id}-edge`}
            x1="11"
            y1="0"
            x2={width - 11}
            y2="0"
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0" stopColor="#fff0bf" stopOpacity="0" />
            <Stop offset="0.65" stopColor="#fff0bf" stopOpacity="0.8" />
            <Stop offset="1" stopColor="#fff0bf" stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect width={width} height={height} fill={`url(#${id}-base)`} />
        <Rect width={width} height={height} fill={`url(#${id}-bloom)`} />
        <G mask={`url(#${id}-security)`}>
          {Array.from({ length: Math.ceil(width / 13) + 8 }, (_, i) => (
            <Ellipse
              key={`mint-${i}`}
              cx={width * 0.9}
              cy={height * 0.4}
              rx={8 + i * 13}
              ry={(8 + i * 13) * ((height * 0.6) / (width * 0.9))}
              fill="none"
              stroke="#b8dab5"
              strokeOpacity="0.09"
              strokeWidth="1"
            />
          ))}
          {Array.from({ length: Math.ceil(width / 16) + 8 }, (_, i) => (
            <Ellipse
              key={`gold-${i}`}
              cx={width * 0.75}
              cy={height * 0.55}
              rx={11 + i * 16}
              ry={(11 + i * 16) * ((height * 0.55) / (width * 0.75))}
              fill="none"
              stroke="#e5cb92"
              strokeOpacity="0.09"
              strokeWidth="1"
            />
          ))}
        </G>
        <Rect
          x="3"
          y="3"
          width={width - 6}
          height={height - 6}
          rx="14"
          fill="none"
          stroke="#081d16"
          strokeWidth="5"
        />
        <Rect
          x="6"
          y="6"
          width={width - 12}
          height={height - 12}
          rx="12"
          fill="none"
          stroke="#dcb875"
          strokeOpacity="0.4"
        />
        <Rect
          x="11"
          y="11"
          width={width - 22}
          height={height - 22}
          rx="10"
          fill="none"
          stroke="#e5cb92"
          strokeOpacity="0.23"
        />
        <Line x1="12" y1="12" x2={width - 12} y2="12" stroke={`url(#${id}-edge)`} />
        <Line
          x1="12"
          y1={height - 12}
          x2={width - 12}
          y2={height - 12}
          stroke={`url(#${id}-edge)`}
          strokeOpacity="0.67"
        />
        <Path
          d={`M 11 35 V 11 H 35 M ${width - 35} ${height - 11} H ${width - 11} V ${height - 35}`}
          fill="none"
          stroke="#e5cb92"
          strokeOpacity="0.6"
        />
      </MembershipCardTexture>
      {holographic && (
        <Svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${width} ${height}`}
          style={StyleSheet.absoluteFill}
        >
          <Defs>
            <LinearGradient
              id={`${id}-watermark`}
              {...(() => {
                const gradient = membershipGradient(watermark, watermark, 120, 2.5);
                return {
                  ...gradient,
                  x1: gradient.x1 + markX,
                  x2: gradient.x2 + markX,
                  y1: gradient.y1 + markY,
                  y2: gradient.y2 + markY,
                };
              })()}
            >
              <Stop offset="0" stopColor="#90efcf" stopOpacity="0.27" />
              <Stop offset="0.25" stopColor="#efd695" stopOpacity="0.73" />
              <Stop offset="0.5" stopColor="#dd94d5" stopOpacity="0.6" />
              <Stop offset="0.75" stopColor="#88d6ec" stopOpacity="0.6" />
              <Stop offset="1" stopColor="#90efcf" stopOpacity="0.27" />
            </LinearGradient>
            <Pattern
              id={`${id}-hatch`}
              width="3"
              height="3"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(50)"
            >
              <Line
                x1="0"
                y1="0"
                x2="0"
                y2="3"
                stroke="#e5cb92"
                strokeOpacity="0.2"
                strokeWidth="1"
              />
            </Pattern>
            <Mask
              id={`${id}-spade`}
              maskType="alpha"
              maskUnits="userSpaceOnUse"
              x={markX}
              y={markY}
              width={watermark}
              height={watermark}
            >
              <Image
                href={artwork.spade}
                x={markX}
                y={markY}
                width={watermark}
                height={watermark}
              />
            </Mask>
          </Defs>
          <G mask={`url(#${id}-spade)`} opacity={0.65}>
            <Rect
              x={markX}
              y={markY}
              width={watermark}
              height={watermark}
              fill={`url(#${id}-watermark)`}
            />
            <Rect
              x={markX}
              y={markY}
              width={watermark}
              height={watermark}
              fill={`url(#${id}-hatch)`}
            />
          </G>
        </Svg>
      )}
    </View>
  );
});

export function MembershipCardBrand({ narrow }: { narrow: boolean }) {
  const id = useId().replace(/:/g, "");
  const emblem = narrow ? 44 : 54;
  const wordmark = narrow ? 100 : 122;
  const crew = narrow ? 62 : 74;
  const height = narrow ? 54 : 64;
  return (
    <View
      accessible
      accessibilityLabel="Big Two Crew"
      pointerEvents="none"
      renderToHardwareTextureAndroid
      shouldRasterizeIOS
      style={{ width: emblem + 6 + wordmark, height, opacity: 0.85, mixBlendMode: "screen" }}
    >
      <Svg width="100%" height="100%" viewBox={`0 0 ${emblem + 6 + wordmark} ${height}`}>
        <Defs>
          <Filter id={`${id}-ink`}>
            <FeColorMatrix
              type="matrix"
              values="0.703 0.197 0.020 0 0 0.059 0.841 0.020 0 0 0.059 0.197 0.664 0 0 0 0 0 1 0"
            />
          </Filter>
        </Defs>
        <G filter={`url(#${id}-ink)`}>
          <Image
            href={artwork.spade}
            x="0"
            y={(height - emblem) / 2}
            width={emblem}
            height={emblem}
          />
          <Image
            href={artwork.title}
            x={emblem + 6}
            y={narrow ? -16 : -19}
            width={wordmark}
            height={wordmark * 0.75}
          />
          <Image
            href={artwork.crew}
            x={emblem + 6 + (wordmark - crew) / 2}
            y={narrow ? 15 : 18}
            width={crew}
            height={crew * 0.75}
          />
        </G>
      </Svg>
    </View>
  );
}

export function MembershipSealFinish() {
  const id = useId().replace(/:/g, "");
  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      <Svg width="100%" height="100%" viewBox="0 0 54 54">
        <Defs>
          <LinearGradient id={`${id}-seal`} {...membershipGradient(54, 54, 145)}>
            <Stop offset="0" stopColor="#ecd6a3" stopOpacity="0.3" />
            <Stop offset="0.6" stopColor="#153426" />
            <Stop offset="1" stopColor="#dcb875" stopOpacity="0.2" />
          </LinearGradient>
          <RadialGradient id={`${id}-shine`} cx="0.65" cy="0.25" rx="0.9" ry="0.9">
            <Stop offset="0" stopColor="#fff0bf" stopOpacity="0.47" />
            <Stop offset="0.65" stopColor="#fff0bf" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle cx="27" cy="27" r="26" fill={`url(#${id}-seal)`} />
        <Circle cx="27" cy="27" r="26" fill={`url(#${id}-shine)`} />
        <Circle cx="27" cy="27" r="24" fill="none" stroke="#081d16" strokeWidth="4" />
        <Circle cx="27" cy="27" r="21.5" fill="none" stroke="#dcb875" strokeOpacity="0.4" />
      </Svg>
    </View>
  );
}
