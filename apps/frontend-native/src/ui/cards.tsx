import { Pressable, StyleSheet, Text, View } from "react-native";
import { getCardKey, type Card } from "@big-two/game-core";
import { colors, fonts } from "./theme";

const symbols = { DIAMOND: "♦", CLUB: "♣", HEART: "♥", SPADE: "♠" };

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
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${names[card.value] ?? card.value} of ${card.suit.toLowerCase()}s`}
      accessibilityState={onPress ? { selected } : undefined}
      style={[cardStyles.card, { width, height: width * 1.48 }, selected && cardStyles.selected]}
    >
      <View style={cardStyles.face}>
        <Text
          style={[cardStyles.rank, { color, fontSize: width * 0.29, lineHeight: width * 0.32 }]}
        >
          {card.value}
        </Text>
        <Text
          style={{
            fontFamily: fonts.display,
            color,
            fontSize: width * 0.24,
            lineHeight: width * 0.26,
          }}
        >
          {symbols[card.suit]}
        </Text>
        <Text style={[cardStyles.suit, { color, fontSize: width * 0.5 }]}>
          {symbols[card.suit]}
        </Text>
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
  const cardWidth = compact ? Math.min(50, width * 0.12) : Math.min(110, width * 0.19);
  const spread = Math.min(0.082, 0.69 / Math.max(cards.length - 1, 1)) * width;
  const total = spread * (cards.length - 1) + cardWidth;
  return (
    <View style={{ width, height: cardWidth * 1.85 + 45, alignSelf: "center" }}>
      {cards.map((card, index) => {
        const offset = index - (cards.length - 1) / 2;
        const isSelected = selected.includes(getCardKey(card));
        return (
          <View
            key={getCardKey(card)}
            pointerEvents="box-none"
            style={{
              position: "absolute",
              zIndex: index,
              left: (width - total) / 2 + index * spread,
              top:
                40 +
                (offset / Math.max((cards.length - 1) / 2, 1)) ** 2 * width * 0.05 -
                (isSelected ? 20 : 0),
              transformOrigin: "bottom center",
              transform: [
                { rotate: `${offset * Math.min(3.5, 32 / Math.max(cards.length - 1, 1))}deg` },
              ],
            }}
          >
            <PlayingCard
              card={card}
              width={cardWidth}
              selected={isSelected}
              onPress={disabled ? undefined : () => onToggle(card)}
            />
          </View>
        );
      })}
    </View>
  );
}

export function CardBacks({ count }: { count: number }) {
  const shown = Math.min(count, 10);
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      style={{ width: 27 + Math.max(0, shown - 1) * 10, height: 37, marginTop: 4 }}
    >
      {Array.from({ length: shown }, (_, index) => (
        <View key={index} style={[cardStyles.back, { left: index * 10 }]}>
          <View style={cardStyles.checker}>
            {Array.from({ length: 12 }, (_, square) => (
              <View
                key={square}
                style={{
                  width: 7,
                  height: 7,
                  backgroundColor: (square + Math.floor(square / 3)) % 2 ? "#a83625" : "#702016",
                }}
              />
            ))}
          </View>
          <Text style={{ color: colors.gold, fontSize: 12 }}>♦</Text>
        </View>
      ))}
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    borderWidth: 2,
    borderColor: "#111",
    borderRadius: 6,
    overflow: "hidden",
    boxShadow: "0 3px 5px rgba(0,0,0,0.4)",
  },
  selected: { borderColor: colors.gold, borderWidth: 2, boxShadow: "0 0 9px #f1c96a" },
  face: { flex: 1, padding: 3, backgroundColor: "#fff" },
  rank: { fontFamily: fonts.display },
  suit: { position: "absolute", right: 4, bottom: 3, fontFamily: fonts.display },
  back: {
    position: "absolute",
    width: 27,
    height: 37,
    borderRadius: 2,
    borderWidth: 1.5,
    borderColor: "#ded8c3",
    backgroundColor: "#8d2118",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  checker: { ...StyleSheet.absoluteFillObject, margin: 2, flexDirection: "row", flexWrap: "wrap" },
});
