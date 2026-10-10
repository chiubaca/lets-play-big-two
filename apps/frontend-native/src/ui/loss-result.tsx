import { useState } from "react";
import { Image, StyleSheet, View, useWindowDimensions } from "react-native";
import { CardSuit } from "./cards";
import { Label } from "./primitives";
import { artwork, fonts } from "./theme";

export function LossResult({ winnerName }: { winnerName?: string }) {
  const window = useWindowDimensions();
  const [width, setWidth] = useState(Math.max(180, Math.min(window.width - 76, 240)));

  return (
    <View
      testID="loss-result"
      style={styles.result}
      onLayout={({ nativeEvent }) => {
        if (nativeEvent.layout.width > 0) setWidth(Math.min(nativeEvent.layout.width, 240));
      }}
    >
      <View style={styles.eyebrow}>
        <View style={styles.rule} />
        <Label style={styles.eyebrowText}>THIS ONE GOT AWAY</Label>
        <View style={styles.rule} />
      </View>
      <View
        testID="loss-artwork"
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ width, height: width * 0.56 }}
      >
        <Image
          accessible={false}
          source={artwork.loser}
          resizeMode="contain"
          style={{
            width,
            height: width * 0.56,
            opacity: 0.8,
          }}
        />
      </View>
      <Label heading style={styles.heading}>
        You lost.
      </Label>
      <Label style={styles.caption}>
        {winnerName ? `${winnerName} wins this hand.` : "Someone else took the table."}
      </Label>
      <Label style={styles.encouragement}>A fresh deal. Another chance.</Label>
      <View
        style={styles.ornament}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View style={styles.rule} />
        <CardSuit suit="DIAMOND" size={8} color="#9b8c75" />
        <View style={styles.rule} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  result: { width: "100%", alignItems: "center" },
  eyebrow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 20 },
  eyebrowText: { fontFamily: fonts.strong, color: "#ac9d85", fontSize: 10, letterSpacing: 2 },
  rule: { width: 28, height: 1, backgroundColor: "#b3a48040" },
  heading: { textAlign: "center", fontSize: 30, lineHeight: 38, color: "#dacdb6" },
  caption: { textAlign: "center", fontSize: 12, color: "#baad96", marginTop: 4 },
  encouragement: { textAlign: "center", fontSize: 12, color: "#9b9686", marginTop: 8 },
  ornament: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 18, marginBottom: 4 },
});
