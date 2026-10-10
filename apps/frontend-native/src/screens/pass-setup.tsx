import { useState } from "react";
import { Image, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Bot, UserRound } from "lucide-react-native";
import { HomeScrollScene } from "../ui/home-scroll-scene";
import { Button, Field, Label, Panel, Sheet } from "../ui/primitives";
import { artwork, colors, fonts } from "../ui/theme";

export interface PassSetupConfig {
  players: { name: string; isBot: boolean }[];
}
export interface PassSetupScreenProps {
  onHome: () => void;
  onStart: (config: PassSetupConfig) => void;
  onResume?: () => void;
  initialConfig?: PassSetupConfig;
  /** Keep true until saved configuration is read, before mounting the editable setup. */
  loading?: boolean;
}

export function PassSetupScreen({
  onHome,
  onStart,
  onResume,
  initialConfig,
  loading = false,
}: PassSetupScreenProps) {
  const { width } = useWindowDimensions();
  const titleWidth = Math.min(width - 32, 620);
  return (
    <HomeScrollScene
      fixedNavigation
      nav={
        <View style={[styles.nav, { width: Math.min(width - 28, 620) }]}>
          <Button title="‹ Home" onPress={onHome} />
        </View>
      }
      logoLabel="Pass and Play"
      renderLogo={(blurRadius) => (
        <Image
          source={artwork.pass}
          accessible={false}
          blurRadius={blurRadius}
          resizeMode="contain"
          style={{ width: titleWidth, height: titleWidth * 0.491 }}
        />
      )}
    >
      {loading ? (
        <Panel style={styles.panel}>
          <Label accessibilityLiveRegion="polite">Loading saved setup…</Label>
        </Panel>
      ) : (
        <PassSetupEditor onStart={onStart} onResume={onResume} initialConfig={initialConfig} />
      )}
    </HomeScrollScene>
  );
}

function PassSetupEditor({
  onStart,
  onResume,
  initialConfig,
}: Pick<PassSetupScreenProps, "onStart" | "onResume" | "initialConfig">) {
  const { width, fontScale } = useWindowDimensions();
  const stackedSeats = width < 360 || fontScale > 1.25;
  const initialPlayers = initialConfig?.players;
  const configuredPlayers =
    initialPlayers &&
    initialPlayers.length >= 2 &&
    initialPlayers.length <= 4 &&
    initialPlayers.every(
      (player) => typeof player.name === "string" && typeof player.isBot === "boolean",
    ) &&
    !initialPlayers[0]?.isBot
      ? initialPlayers
      : undefined;
  const [count, setCount] = useState(() => configuredPlayers?.length ?? 4);
  const [names, setNames] = useState(() =>
    ["You", "Player 2", "Player 3", "Player 4"].map(
      (fallback, index) => configuredPlayers?.[index]?.name ?? fallback,
    ),
  );
  const [bots, setBots] = useState(() =>
    [false, false, true, true].map(
      (fallback, index) => configuredPlayers?.[index]?.isBot ?? fallback,
    ),
  );
  const [typeEditor, setTypeEditor] = useState<number | null>(null);
  const humans = names
    .slice(0, count)
    .filter((_, index) => !bots[index])
    .map((name) => name.trim().normalize("NFC"));
  const duplicate = new Set(humans.map((name) => name.toLowerCase())).size !== humans.length;
  const missing = humans.some((name) => !name);
  const valid = !duplicate && !missing && humans.every((name) => name.length <= 24);

  return (
    <>
      <Panel style={styles.panel}>
        <Label heading style={styles.section}>
          Number of players
        </Label>
        <View style={styles.row}>
          {[2, 3, 4].map((number) => (
            <Pressable
              key={number}
              accessibilityRole="button"
              accessibilityLabel={`${number} players`}
              accessibilityState={{ selected: count === number }}
              onPress={() => setCount(number)}
              style={[styles.count, count === number && styles.selected]}
            >
              <Label heading style={{ color: count === number ? colors.panel : colors.cream }}>
                {number}
              </Label>
            </Pressable>
          ))}
        </View>
        <Label heading style={[styles.section, { marginTop: 12 }]}>
          Fill with bots <Label style={{ color: colors.muted }}>(optional)</Label>
        </Label>
        <View style={{ gap: 10 }}>
          {names.slice(0, count).map((name, index) => (
            <View key={index} style={[styles.seat, stackedSeats && styles.stackedSeat]}>
              <View style={[styles.seatContent, stackedSeats && styles.stackedContent]}>
                <View style={styles.avatar}>
                  {bots[index] ? (
                    <Bot color={colors.gold} size={25} />
                  ) : (
                    <UserRound color={colors.gold} size={25} />
                  )}
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Label style={{ fontFamily: fonts.strong, fontSize: 12 }}>
                    Player {index + 1}
                  </Label>
                  <Field
                    accessibilityLabel={`Player ${index + 1} name`}
                    value={bots[index] ? `AI ${index + 1}` : name}
                    editable={!bots[index]}
                    maxLength={24}
                    placeholder="Enter a name"
                    autoCorrect={false}
                    onChangeText={(value) =>
                      setNames((previous) =>
                        previous.map((item, seat) => (seat === index ? value : item)),
                      )
                    }
                    style={styles.name}
                  />
                </View>
              </View>
              <Button
                title={bots[index] ? "Bot ⌄" : "Human ⌄"}
                accessibilityLabel={`Choose player ${index + 1} type, currently ${bots[index] ? "bot" : "human"}`}
                onPress={() => setTypeEditor(index)}
                style={styles.type}
              />
            </View>
          ))}
        </View>
        {/* Keep both messages in flow so wrapping and font scaling are reserved too. */}
        <View>
          {[
            { message: "Use a different name for each player.", visible: duplicate && !missing },
            { message: "Enter a name for each human player.", visible: missing },
          ].map(({ message, visible }) => (
            <Label
              key={message}
              accessibilityRole={visible ? "alert" : undefined}
              accessibilityLiveRegion={visible ? "polite" : "none"}
              accessibilityElementsHidden={!visible}
              importantForAccessibility={visible ? "auto" : "no-hide-descendants"}
              style={[styles.error, { opacity: visible ? 1 : 0 }]}
            >
              {message}
            </Label>
          ))}
        </View>
        <Label style={styles.hint}>
          Cards stay hidden between turns. Pass the device, then press Ready when it’s yours.
        </Label>
        <Button title="Resume saved game" disabled={!onResume} onPress={() => onResume?.()} />
        <Button
          title="Start game →"
          gold
          disabled={!valid}
          style={styles.start}
          labelStyle={{ fontSize: 22, lineHeight: 29 }}
          onPress={() => {
            if (!valid) return;
            onStart({
              players: names.slice(0, count).map((name, index) => ({
                name: bots[index] ? `AI ${index + 1}` : name.trim().normalize("NFC"),
                isBot: bots[index],
              })),
            });
          }}
        />
      </Panel>
      <Sheet
        visible={typeEditor !== null}
        onClose={() => setTypeEditor(null)}
        title={`Player ${(typeEditor ?? 0) + 1} type`}
      >
        <Button
          title="Human"
          onPress={() => {
            setBots((previous) =>
              previous.map((bot, index) => (index === typeEditor ? false : bot)),
            );
            setTypeEditor(null);
          }}
        />
        {typeEditor !== 0 && (
          <Button
            title="Bot"
            onPress={() => {
              setBots((previous) =>
                previous.map((bot, index) => (index === typeEditor ? true : bot)),
              );
              setTypeEditor(null);
            }}
          />
        )}
        {typeEditor === 0 && (
          <Label style={styles.hint}>The first seat is always a human player.</Label>
        )}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  nav: { width: "100%", maxWidth: 620, alignItems: "flex-start" },
  panel: { width: "100%", maxWidth: 620, padding: 20, borderRadius: 36, gap: 16, marginBottom: 32 },
  section: { fontSize: 21, lineHeight: 28 },
  row: { flexDirection: "row", gap: 10 },
  count: {
    flex: 1,
    minHeight: 58,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: 21,
    backgroundColor: "#041b12",
  },
  selected: { backgroundColor: colors.gold, borderColor: "#ffe2a0" },
  start: { minHeight: 72, borderRadius: 26 },
  seat: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    padding: 10,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 21,
    backgroundColor: "#061e14",
  },
  avatar: { width: 36, height: 42, alignItems: "center", justifyContent: "center" },
  seatContent: { flex: 1, minWidth: 0, flexDirection: "row", gap: 8, alignItems: "center" },
  stackedSeat: { flexDirection: "column", alignItems: "stretch" },
  stackedContent: { flex: 0 },
  name: {
    borderWidth: 0,
    minHeight: 48,
    paddingHorizontal: 0,
    backgroundColor: "transparent",
    fontSize: 13,
    color: colors.muted,
  },
  type: { paddingHorizontal: 10, borderRadius: 15, minWidth: 89 },
  hint: { fontSize: 12, lineHeight: 19, color: colors.muted },
  error: { color: "#ffb3a8", fontSize: 13, lineHeight: 20 },
});
