import { useState } from "react";
import { Image, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Bot, UserRound } from "lucide-react-native";
import { Button, CasinoScreen, ErrorMessage, Field, Label, Panel, Sheet } from "../ui/primitives";
import { artwork, colors, fonts } from "../ui/theme";

export interface PassSetupConfig {
  players: { name: string; isBot: boolean }[];
}
export interface PassSetupScreenProps {
  onHome: () => void;
  onStart: (config: PassSetupConfig) => void;
  onResume?: () => void;
  initialConfig?: PassSetupConfig;
}

export function PassSetupScreen({
  onHome,
  onStart,
  onResume,
  initialConfig,
}: PassSetupScreenProps) {
  const { width } = useWindowDimensions();
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
    <CasinoScreen scroll>
      <View style={styles.nav}>
        <Button title="‹ Home" onPress={onHome} />
      </View>
      <Image
        source={artwork.pass}
        accessibilityLabel="Pass and Play"
        resizeMode="contain"
        style={{ width: Math.min(width - 32, 620), height: Math.min(width - 32, 620) * 0.491 }}
      />
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
            <View key={index} style={styles.seat}>
              <View style={styles.avatar}>
                {bots[index] ? (
                  <Bot color={colors.gold} size={25} />
                ) : (
                  <UserRound color={colors.gold} size={25} />
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Label style={{ fontFamily: fonts.strong, fontSize: 12 }}>Player {index + 1}</Label>
                {bots[index] ? (
                  <Label style={{ color: colors.muted }}>AI {index + 1}</Label>
                ) : (
                  <Field
                    accessibilityLabel={`Player ${index + 1} name`}
                    value={name}
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
                )}
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
        <ErrorMessage
          message={
            duplicate && !missing
              ? "Use a different name for each player."
              : missing
                ? "Enter a name for each human player."
                : null
          }
        />
        <Label style={styles.hint}>
          Cards stay hidden between turns. Pass the device, then press Ready when it’s yours.
        </Label>
        {onResume && <Button title="Resume saved game" onPress={onResume} />}
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
    </CasinoScreen>
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
  name: {
    borderWidth: 0,
    minHeight: 38,
    paddingHorizontal: 0,
    backgroundColor: "transparent",
    fontSize: 13,
    color: colors.muted,
  },
  type: { paddingHorizontal: 10, borderRadius: 15, minWidth: 89 },
  hint: { fontSize: 12, lineHeight: 19, color: colors.muted },
});
