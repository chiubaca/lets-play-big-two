import { memo, useId } from "react";
import { StyleSheet, View } from "react-native";
import Svg, {
  ClipPath,
  Defs,
  Image,
  LinearGradient,
  Path,
  RadialGradient,
  Stop,
} from "react-native-svg";

// Draw the perspective into the surface rather than transforming its touch targets.
export const TableSurface = memo(function TableSurface({
  width,
  height,
}: {
  width: number;
  height: number;
}) {
  const id = useId().replace(/:/g, "");
  if (width <= 0 || height <= 0) return null;
  const path = (inset: number) => {
    const top = width * 0.065 + inset;
    const radius = Math.min(width * 0.15, height * 0.18);
    const bottom = height - inset;
    return `M ${top + radius} ${inset}
      H ${width - top - radius}
      Q ${width - top} ${inset} ${width - top + radius * 0.08} ${inset + radius}
      L ${width - inset} ${bottom - radius * 0.55}
      Q ${width - inset + radius * 0.04} ${bottom} ${width - inset - radius} ${bottom}
      H ${inset + radius}
      Q ${inset - radius * 0.04} ${bottom} ${inset} ${bottom - radius * 0.55}
      L ${top - radius * 0.08} ${inset + radius}
      Q ${top} ${inset} ${top + radius} ${inset} Z`;
  };
  const rim = Math.min(18, width * 0.033);
  const felt = path(rim);
  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <Defs>
          <LinearGradient id={`${id}-wood`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#342719" />
            <Stop offset="0.2" stopColor="#17130c" />
            <Stop offset="0.88" stopColor="#21190f" />
            <Stop offset="1" stopColor="#45321d" />
          </LinearGradient>
          <LinearGradient id={`${id}-brass`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#a17835" />
            <Stop offset="0.28" stopColor="#f0ce7b" />
            <Stop offset="0.6" stopColor="#b48d40" />
            <Stop offset="1" stopColor="#edc770" />
          </LinearGradient>
          <RadialGradient id={`${id}-felt`} cx="50%" cy="35%" rx="70%" ry="75%">
            <Stop offset="0" stopColor="#226242" />
            <Stop offset="0.48" stopColor="#124a30" />
            <Stop offset="0.85" stopColor="#052e1a" />
            <Stop offset="1" stopColor="#011d10" />
          </RadialGradient>
          <ClipPath id={`${id}-shell-clip`}>
            <Path d={path(1)} />
          </ClipPath>
          <ClipPath id={`${id}-felt-clip`}>
            <Path d={felt} />
          </ClipPath>
        </Defs>
        <Path d={path(1)} fill={`url(#${id}-wood)`} stroke="#785020" strokeWidth={1} />
        <Path d={path(4)} fill="none" stroke="#080b06" strokeWidth={4} />
        <Path d={path(7)} fill="none" stroke="#77603a" strokeWidth={0.8} />
        {Array.from({ length: Math.ceil(height / 4) }, (_, index) => (
          <Path
            key={index}
            d={`M 0 ${index * 4} L ${width} ${index * 4 + width * 0.035}`}
            stroke={index % 2 ? "#80613b" : "#050704"}
            strokeOpacity={0.16}
            strokeWidth={0.7}
            clipPath={`url(#${id}-shell-clip)`}
          />
        ))}
        <Path d={felt} fill={`url(#${id}-felt)`} />
        {/* Felt cropped from the shared casino backdrop, not a new background. */}
        <Image
          href={require("../../assets/table-felt.png")}
          x={0}
          y={0}
          width={width}
          height={height}
          preserveAspectRatio="none"
          opacity={0.22}
          clipPath={`url(#${id}-felt-clip)`}
        />
        <Path d={felt} fill="none" stroke="#061309" strokeWidth={6} />
        <Path d={felt} fill="none" stroke={`url(#${id}-brass)`} strokeWidth={2.5} />
        <Path d={path(rim + 5)} fill="none" stroke="#152c13" strokeWidth={3} />
        <Path
          d={path(rim + 11)}
          fill="none"
          stroke="#74924a"
          strokeOpacity={0.25}
          strokeWidth={2}
        />
      </Svg>
    </View>
  );
});
