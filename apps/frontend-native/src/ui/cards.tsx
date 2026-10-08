import { useId } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, Pattern, Rect, Path } from "react-native-svg";
import { getCardKey, type Card } from "@big-two/game-core";
import { colors, fonts } from "./theme";
import { handLayout } from "./hand-layout";

const cardBorderWidth = 2;

export function CardSuit({
  suit,
  size,
  color,
}: {
  suit: Card["suit"];
  size: number;
  color: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessible={false}>
      {suit === "DIAMOND" ? (
        <Path d="M 50 4 L 80 50 L 50 96 L 20 50 Z" fill={color} />
      ) : suit === "HEART" ? (
        <Path
          d="M 50 92 C 38 80 6 56 6 31 C 6 5 35 1 50 24 C 65 1 94 5 94 31 C 94 56 62 80 50 92 Z"
          fill={color}
        />
      ) : suit === "SPADE" ? (
        <Path
          d="M 50 3 C 40 17 7 42 7 63 C 7 88 35 92 47 72 C 46 85 41 91 34 97 H 66 C 59 91 54 85 53 72 C 65 92 93 88 93 63 C 93 42 60 17 50 3 Z"
          fill={color}
        />
      ) : (
        <>
          <Circle cx={50} cy={26} r={23} fill={color} />
          <Circle cx={25} cy={60} r={23} fill={color} />
          <Circle cx={75} cy={60} r={23} fill={color} />
          <Path d="M 47 48 H 53 C 53 77 55 89 66 97 H 34 C 45 89 47 77 47 48 Z" fill={color} />
        </>
      )}
    </Svg>
  );
}

export function PlayingCard({
  card,
  width = 48,
  selected = false,
  onPress,
}: {
  card: Card;
  width?: number;
  selected?: boolean;
  onPress?: () => void;
}) {
  const color = card.suit === "DIAMOND" || card.suit === "HEART" ? "#d50918" : "#111";
  const names: Record<string, string> = { J: "jack", Q: "queen", K: "king", A: "ace" };
  const faceWidth = width - cardBorderWidth * 2;
  return (
    <Pressable
      testID={`playing-card-${getCardKey(card)}`}
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${names[card.value] ?? card.value} of ${card.suit.toLowerCase()}s`}
      accessibilityState={onPress ? { selected } : undefined}
      style={[cardStyles.card, { width, height: width * 1.48 }, selected && cardStyles.selected]}
    >
      <View style={cardStyles.face}>
        {[false, true].map((bottom) => (
          <View key={String(bottom)} style={[cardStyles.corner, bottom && cardStyles.bottomCorner]}>
            <Text
              style={[
                cardStyles.rank,
                { color, fontSize: faceWidth * 0.24, lineHeight: faceWidth * 0.26 },
              ]}
            >
              {card.value}
            </Text>
            <CardSuit suit={card.suit} size={faceWidth * 0.15} color={color} />
          </View>
        ))}
        <View>
          <CardSuit suit={card.suit} size={faceWidth * 0.46} color={color} />
        </View>
      </View>
    </Pressable>
  );
}

export function Hand({
  cards,
  selected,
  onToggle,
  width,
  disabled = false,
  compact = false,
}: {
  cards: Card[];
  selected: string[];
  onToggle: (card: Card) => void;
  width: number;
  disabled?: boolean;
  compact?: boolean;
}) {
  const layout = handLayout(width, cards.length, compact);
  return (
    <View style={{ width, height: layout.height, alignSelf: "center" }}>
      {cards.map((card, index) => {
        const isSelected = selected.includes(getCardKey(card));
        const position = layout.card(index, isSelected);
        return (
          <View
            key={getCardKey(card)}
            pointerEvents="box-none"
            style={{
              position: "absolute",
              zIndex: index,
              left: position.left,
              top: position.top,
              transformOrigin: "bottom center",
              transform: [{ rotate: `${position.angle}deg` }],
            }}
          >
            <PlayingCard
              card={card}
              width={layout.cardWidth}
              selected={isSelected}
              onPress={disabled ? undefined : () => onToggle(card)}
            />
          </View>
        );
      })}
    </View>
  );
}

export function CardBack({ width = 27 }: { width?: number }) {
  const patternId = `card-back-${useId().replace(/:/g, "")}`;
  return (
    <Svg width={width} height={width * (37 / 27)} viewBox="0 0 27 37" accessible={false}>
      <Defs>
        <Pattern id={patternId} width={4} height={4} patternUnits="userSpaceOnUse">
          <Rect width={4} height={4} fill="#852019" />
          <Rect width={2} height={2} fill="#ac2921" />
          <Rect x={2} y={2} width={2} height={2} fill="#ac2921" />
        </Pattern>
      </Defs>
      <Rect
        x={0.8}
        y={0.8}
        width={25.4}
        height={35.4}
        rx={2}
        fill="#64180f"
        stroke="#ded8c3"
        strokeWidth={1.6}
      />
      <Rect
        x={3}
        y={3}
        width={21}
        height={31}
        fill={`url(#${patternId})`}
        stroke="#31150d"
        strokeWidth={0.8}
      />
      <Path d="M 13.5 13 L 18 18.5 L 13.5 24 L 9 18.5 Z" fill="#e0a04f" />
    </Svg>
  );
}

export function CardBacks({ count, compact = false }: { count: number; compact?: boolean }) {
  const shown = Math.min(count, 10);
  const width = compact ? 23 : 27;
  const spread = compact ? 8 : 10;
  if (!shown) return null;
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      style={{ width: width + (shown - 1) * spread, height: width * (37 / 27), marginTop: 4 }}
    >
      {Array.from({ length: shown }, (_, index) => (
        <View key={index} style={[cardStyles.back, { left: index * spread }]}>
          <CardBack width={width} />
        </View>
      ))}
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    borderWidth: cardBorderWidth,
    borderColor: "#111",
    borderRadius: 6,
    overflow: "hidden",
    boxShadow: "0 3px 5px rgba(0,0,0,0.4)",
  },
  selected: {
    borderColor: colors.gold,
    borderWidth: cardBorderWidth,
    boxShadow: "0 0 9px #f1c96a",
  },
  face: { flex: 1, backgroundColor: "#fff", justifyContent: "center", alignItems: "center" },
  corner: { position: "absolute", top: "5%", left: "7%", alignItems: "center" },
  bottomCorner: {
    top: undefined,
    left: undefined,
    bottom: "5%",
    right: "7%",
    transform: [{ rotate: "180deg" }],
  },
  rank: { fontFamily: fonts.display, includeFontPadding: false },
  back: {
    position: "absolute",
    boxShadow: "1px 3px 4px rgba(0,0,0,0.45)",
  },
});
