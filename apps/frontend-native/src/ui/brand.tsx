import { Image, StyleSheet, View } from "react-native";
import { artwork } from "./theme";

export function Brand({
  width = 360,
  blurRadius = 0,
  accessible = true,
  sources = artwork,
}: {
  width?: number;
  blurRadius?: number;
  accessible?: boolean;
  sources?: Pick<typeof artwork, "spade" | "title" | "crew">;
}) {
  return (
    <View
      accessible={accessible}
      accessibilityLabel={accessible ? "Big Two Crew" : undefined}
      pointerEvents="none"
      style={{ width, height: width * 1.06 }}
    >
      <Image
        accessible={false}
        blurRadius={blurRadius}
        source={sources.spade}
        resizeMode="contain"
        style={[
          brand.layer,
          { left: width * 0.2, width: width * 0.6, top: 0, height: width * 0.6042 },
        ]}
      />
      <Image
        accessible={false}
        blurRadius={blurRadius}
        source={sources.title}
        resizeMode="contain"
        style={[brand.layer, { top: width * 0.3074, height: width * 0.725275 }]}
      />
      <Image
        accessible={false}
        blurRadius={blurRadius}
        source={sources.crew}
        resizeMode="contain"
        style={[
          brand.layer,
          { left: width * 0.2, width: width * 0.6, top: width * 0.6466, height: width * 0.435165 },
        ]}
      />
    </View>
  );
}

const brand = StyleSheet.create({
  layer: { position: "absolute", width: "100%" },
});
