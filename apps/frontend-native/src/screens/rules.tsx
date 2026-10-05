import { StyleSheet, View } from "react-native";
import { CARD_VALUES, SUITS, type Card } from "@big-two/game-core";
import { PlayingCard } from "../ui/cards";
import { Label, Sheet } from "../ui/primitives";
import { colors, fonts } from "../ui/theme";

const suitNames = { DIAMOND: "Diamonds", CLUB: "Clubs", HEART: "Hearts", SPADE: "Spades" };
const combos: { name: string; detail: string; tie: string; cards: Card[] }[] = [
  {
    name: "Straight",
    detail: "Five consecutive ranks",
    tie: "Compare the highest card, then its suit.",
    cards: [
      { value: "3", suit: "DIAMOND" },
      { value: "4", suit: "CLUB" },
      { value: "5", suit: "HEART" },
      { value: "6", suit: "SPADE" },
      { value: "7", suit: "DIAMOND" },
    ],
  },
  {
    name: "Flush",
    detail: "Five cards of one suit",
    tie: "Compare suit first, then the highest card.",
    cards: ["3", "5", "8", "J", "K"].map((value) => ({ value, suit: "HEART" }) as Card),
  },
  {
    name: "Full house",
    detail: "Three of a kind + a pair",
    tie: "Compare the triple’s rank, then its highest suit.",
    cards: [
      { value: "8", suit: "DIAMOND" },
      { value: "8", suit: "CLUB" },
      { value: "8", suit: "SPADE" },
      { value: "K", suit: "HEART" },
      { value: "K", suit: "SPADE" },
    ],
  },
  {
    name: "Four of a kind",
    detail: "Four matching ranks + any card",
    tie: "Compare the four matching cards’ rank.",
    cards: [...SUITS.map((suit) => ({ value: "9", suit }) as Card), { value: "3", suit: "CLUB" }],
  },
  {
    name: "Straight flush",
    detail: "Five consecutive ranks, one suit",
    tie: "Compare the highest card, then its suit.",
    cards: ["6", "7", "8", "9", "10"].map((value) => ({ value, suit: "SPADE" }) as Card),
  },
];

export interface RulesSheetProps {
  visible: boolean;
  onClose: () => void;
}
export function RulesSheet({ visible, onClose }: RulesSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Big Two cheat sheet">
      <Label style={styles.note}>
        A quick guide to ranks, suits, and the hands that win the table. Start small. Finish first.
      </Label>
      <View style={styles.section}>
        <Label heading style={styles.heading}>
          Suit order
        </Label>
        <Label mono>LOW → HIGH</Label>
        <View style={styles.suits}>
          {SUITS.map((suit) => (
            <View key={suit} style={styles.suit}>
              <PlayingCard card={{ value: "A", suit }} width={44} />
              <Label style={styles.small}>{suitNames[suit]}</Label>
            </View>
          ))}
        </View>
        <Label style={styles.note}>Same rank? The higher suit wins. Spades are strongest.</Label>
      </View>
      <View style={styles.section}>
        <Label heading style={styles.heading}>
          Rank order
        </Label>
        <Label mono>LOW → HIGH</Label>
        <View style={styles.ranks}>
          {CARD_VALUES.map((value) => (
            <Label key={value} style={styles.rank}>
              {value}
            </Label>
          ))}
        </View>
        <Label style={styles.note}>
          3 is lowest. 2 is highest. Straights don’t wrap: no A–2–3–4–5.
        </Label>
      </View>
      <View style={styles.section}>
        <Label heading style={styles.heading}>
          Match the play
        </Label>
        <View style={styles.basic}>
          <PlayingCard card={{ value: "J", suit: "SPADE" }} width={43} />
          <View style={styles.copy}>
            <Label style={styles.strong}>Single → higher single</Label>
            <Label style={styles.note}>Compare rank, then suit.</Label>
          </View>
        </View>
        <View style={styles.basic}>
          <View style={styles.hand}>
            <PlayingCard card={{ value: "8", suit: "HEART" }} width={38} />
            <PlayingCard card={{ value: "8", suit: "SPADE" }} width={38} />
          </View>
          <View style={styles.copy}>
            <Label style={styles.strong}>Pair → higher pair</Label>
            <Label style={styles.note}>Same rank; compare the highest suit.</Label>
          </View>
        </View>
        <Label style={styles.note}>
          Match the number of cards played: 1, 2, or 5. No standalone triples.
        </Label>
      </View>
      <View style={styles.section}>
        <Label heading style={styles.heading}>
          Five-card hands
        </Label>
        <Label mono>LOW → HIGH</Label>
        <Label style={styles.note}>
          Each hand beats every type above it. Same type? Use the tie-break below.
        </Label>
        {combos.map((combo, index) => (
          <View key={combo.name} style={styles.combo}>
            <Label style={styles.strong}>
              {index + 1}. {combo.name}
            </Label>
            <Label style={styles.note}>{combo.detail}</Label>
            <View style={styles.hand}>
              {combo.cards.map((card) => (
                <View key={`${card.value}-${card.suit}`} style={styles.comboCard}>
                  <PlayingCard card={card} width={40} />
                </View>
              ))}
            </View>
            <Label style={styles.small}>{combo.tie}</Label>
          </View>
        ))}
      </View>
      <View style={[styles.section, styles.tip]}>
        <PlayingCard card={{ value: "3", suit: "DIAMOND" }} width={42} />
        <Label style={styles.strong}>Start small. Finish first.</Label>
        <Label style={styles.note}>
          The first play must include 3 ♦. Can’t beat a play? Pass. When everyone else passes, the
          last player starts a fresh round with any valid hand.
        </Label>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.line },
  heading: { fontSize: 16, lineHeight: 22, color: colors.gold },
  suits: { flexDirection: "row", justifyContent: "space-between", gap: 4 },
  suit: { alignItems: "center", gap: 7 },
  hand: { flexDirection: "row" },
  comboCard: { width: 30, height: 58 },
  basic: { flexDirection: "row", alignItems: "center", gap: 13 },
  copy: { flex: 1, gap: 4 },
  strong: { fontFamily: fonts.strong, color: colors.cream },
  note: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  small: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  ranks: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  rank: {
    minWidth: 19,
    textAlign: "center",
    paddingVertical: 3,
    color: colors.gold,
    fontFamily: fonts.display,
    fontSize: 16,
  },
  combo: {
    gap: 7,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    backgroundColor: "#061d13",
    padding: 13,
  },
  tip: {
    padding: 14,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.goldDark,
    backgroundColor: "#242410",
  },
});
