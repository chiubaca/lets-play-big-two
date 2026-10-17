import { StyleSheet, View } from "react-native";
import type { Player } from "@big-two/game-state-machine";

export function isJevBotOnline(player: Player | undefined, connected: boolean): boolean {
  return connected && player?.isBot === true && player.usesJev === true;
}

/** No label or animation; the seat announces connectivity to screen readers. */
export function BotJevIndicator({
  player,
  connected = true,
}: {
  player?: Player;
  connected?: boolean;
}) {
  if (!player?.isBot) return null;
  const online = isJevBotOnline(player, connected);
  return (
    <View
      testID={`bot-jev-${player.id}`}
      pointerEvents="none"
      accessible={false}
      style={[styles.dot, online ? styles.online : styles.offline]}
    />
  );
}

const styles = StyleSheet.create({
  dot: {
    position: "absolute",
    right: 1,
    bottom: 1,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "#07190c",
  },
  online: { backgroundColor: "#6db58c" },
  offline: { backgroundColor: "#727970" },
});
