import { useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { ChevronDown, Pencil } from "lucide-react-native";
import { authClient } from "../network";
import { Button, CasinoScreen, ErrorMessage, Field, Label, Sheet } from "../ui/primitives";
import { artwork, colors, fonts } from "../ui/theme";
import { usernameError } from "./auth";
import type { HomeSession } from "./home";

const emojiGroups = [
  {
    label: "At the table",
    emojis: [
      "♠️",
      "♥️",
      "♦️",
      "♣️",
      "🃏",
      "🎲",
      "🎰",
      "🏆",
      "🥇",
      "🥈",
      "🥉",
      "🎯",
      "🎱",
      "🪙",
      "💎",
      "👑",
      "🎩",
      "🪄",
      "🔮",
      "🧿",
      "🪬",
      "🎭",
      "🎨",
      "🎪",
    ],
  },
  {
    label: "Faces",
    emojis: [
      "😀",
      "😃",
      "😄",
      "😁",
      "😆",
      "😅",
      "😂",
      "🤣",
      "😊",
      "😇",
      "🙂",
      "🙃",
      "😉",
      "😎",
      "🤩",
      "🥳",
      "😍",
      "🥰",
      "😘",
      "😋",
      "😛",
      "😜",
      "🤪",
      "🤨",
      "🧐",
      "🤓",
      "😏",
      "😌",
      "😴",
      "🤤",
      "🥹",
      "🥺",
      "😤",
      "😮",
      "🤯",
      "😱",
      "🫣",
      "🤭",
      "🫢",
      "🤫",
      "🤔",
      "🫡",
      "🤗",
      "🫠",
      "🤠",
      "🥷",
      "😈",
      "👿",
      "👻",
      "💀",
      "☠️",
      "👽",
      "👾",
      "🤖",
      "💩",
      "🤡",
    ],
  },
  {
    label: "Animals",
    emojis: [
      "🐶",
      "🐱",
      "🐭",
      "🐹",
      "🐰",
      "🦊",
      "🐻",
      "🐼",
      "🐨",
      "🐯",
      "🦁",
      "🐮",
      "🐷",
      "🐸",
      "🐵",
      "🙈",
      "🙉",
      "🙊",
      "🐔",
      "🐧",
      "🐦",
      "🐤",
      "🦆",
      "🦉",
      "🦅",
      "🦇",
      "🐺",
      "🐗",
      "🐴",
      "🦄",
      "🫎",
      "🐝",
      "🦋",
      "🐌",
      "🐞",
      "🪲",
      "🦗",
      "🕷️",
      "🦂",
      "🐢",
      "🐍",
      "🦎",
      "🐲",
      "🐉",
      "🦕",
      "🦖",
      "🐙",
      "🦑",
      "🦀",
      "🦞",
      "🐠",
      "🐡",
      "🦈",
      "🐬",
      "🐳",
      "🦭",
      "🦦",
      "🦥",
      "🦔",
      "🦜",
      "🦩",
      "🦚",
      "🦢",
      "🪿",
    ],
  },
  {
    label: "Nature & space",
    emojis: [
      "🌵",
      "🎄",
      "🌲",
      "🌳",
      "🌴",
      "🌱",
      "🌿",
      "☘️",
      "🍀",
      "🍁",
      "🍂",
      "🍄",
      "🌸",
      "🌺",
      "🌻",
      "🌹",
      "🌷",
      "🪷",
      "🌼",
      "💐",
      "🌞",
      "🌝",
      "🌚",
      "🌙",
      "⭐",
      "🌟",
      "✨",
      "⚡",
      "☄️",
      "💥",
      "🔥",
      "🌈",
      "☀️",
      "⛅",
      "☁️",
      "❄️",
      "☃️",
      "🌊",
      "💧",
      "🪐",
      "🌍",
      "🌎",
      "🌏",
      "🚀",
      "🛸",
      "🌋",
    ],
  },
  {
    label: "Food & drink",
    emojis: [
      "🍎",
      "🍐",
      "🍊",
      "🍋",
      "🍌",
      "🍉",
      "🍇",
      "🍓",
      "🫐",
      "🍒",
      "🍑",
      "🥭",
      "🍍",
      "🥥",
      "🥝",
      "🥑",
      "🍆",
      "🥕",
      "🌽",
      "🌶️",
      "🥦",
      "🥐",
      "🥯",
      "🥨",
      "🧀",
      "🍔",
      "🍟",
      "🍕",
      "🌭",
      "🌮",
      "🌯",
      "🥙",
      "🥪",
      "🍜",
      "🍝",
      "🍣",
      "🍙",
      "🍚",
      "🥟",
      "🥠",
      "🍤",
      "🍳",
      "🥞",
      "🧇",
      "🍿",
      "🍩",
      "🍪",
      "🎂",
      "🧁",
      "🍦",
      "🍫",
      "🍬",
      "🍭",
      "🍯",
      "☕",
      "🍵",
      "🧋",
      "🍺",
      "🍷",
      "🍸",
      "🍹",
      "🥂",
    ],
  },
  {
    label: "Play & adventure",
    emojis: [
      "⚽",
      "🏀",
      "🏈",
      "⚾",
      "🎾",
      "🏐",
      "🏉",
      "🥏",
      "🏓",
      "🏸",
      "🏒",
      "🥊",
      "🥋",
      "⛳",
      "🛹",
      "🛼",
      "🎿",
      "🏂",
      "🏄",
      "🚴",
      "🧗",
      "🏕️",
      "⛺",
      "🏔️",
      "🏝️",
      "🏖️",
      "🎢",
      "🎡",
      "🎮",
      "🕹️",
      "🎸",
      "🎹",
      "🥁",
      "🎺",
      "🎷",
      "🎻",
      "🎤",
      "🎧",
      "📷",
      "🎬",
      "🧩",
      "🧸",
      "🪁",
      "🎈",
      "🎉",
      "🎊",
      "🎁",
    ],
  },
  {
    label: "Hearts & good luck",
    emojis: [
      "❤️",
      "🧡",
      "💛",
      "💚",
      "💙",
      "💜",
      "🖤",
      "🤍",
      "🤎",
      "🩷",
      "🩵",
      "🩶",
      "💖",
      "💗",
      "💓",
      "💕",
      "💞",
      "💘",
      "💝",
      "💟",
      "💌",
      "💯",
      "💫",
      "💬",
      "👍",
      "👌",
      "🤌",
      "🤞",
      "✌️",
      "🤟",
      "🤘",
      "🤙",
      "👋",
      "🫶",
      "👏",
      "🙌",
      "🙏",
      "💪",
      "🦾",
      "🧠",
      "👀",
      "💋",
    ],
  },
];

export function MembershipCard({
  name,
  emoji,
  compact = false,
  enlarged = false,
  onEditName,
  onEditEmoji,
  onInspect,
}: {
  name: string;
  emoji: string;
  compact?: boolean;
  enlarged?: boolean;
  onEditName?: () => void;
  onEditEmoji?: () => void;
  onInspect?: () => void;
}) {
  if (compact)
    return (
      <LinearGradient colors={["#153c2d", "#071b15"]} style={styles.compact}>
        <Label style={{ fontSize: 22 }}>{emoji}</Label>
        <Label heading style={styles.compactName}>
          {name}
        </Label>
        <ChevronDown color={colors.gold} size={15} />
      </LinearGradient>
    );
  return (
    <LinearGradient
      colors={["#355c42", "#10291f", "#071b15", "#153c2d"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.card, enlarged && styles.enlargedCard]}
    >
      <View pointerEvents="none" style={styles.frame} />
      {onInspect && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Inspect your membership card"
          onPress={onInspect}
          style={styles.inspectTarget}
        />
      )}
      <Image source={artwork.spade} resizeMode="contain" style={styles.watermark} />
      <LinearGradient
        pointerEvents="none"
        colors={["#8df3db00", "#eed5a715", "#d39dc719", "#8df3db00"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.top}>
        <View accessible accessibilityLabel="Big Two Crew" style={styles.cardBrand}>
          <Image source={artwork.spade} resizeMode="contain" style={{ width: 46, height: 46 }} />
          <View style={{ width: 108, height: 60 }}>
            <Image
              source={artwork.title}
              resizeMode="contain"
              style={{ position: "absolute", top: -17, width: 108, height: 78 }}
            />
            <Image
              source={artwork.crew}
              resizeMode="contain"
              style={{ position: "absolute", top: 16, left: 21, width: 66, height: 48 }}
            />
          </View>
        </View>
        <Pressable
          accessibilityRole={onEditEmoji ? "button" : undefined}
          accessibilityLabel={onEditEmoji ? "Edit profile emoji" : `Profile emoji ${emoji}`}
          disabled={!onEditEmoji}
          onPress={onEditEmoji}
          style={styles.seal}
        >
          <Label style={{ fontSize: 29, lineHeight: 38 }}>{emoji}</Label>
          {onEditEmoji && (
            <View style={styles.sealEdit}>
              <Pencil color={colors.gold} size={13} />
            </View>
          )}
        </Pressable>
      </View>
      <View pointerEvents="box-none" style={{ gap: 3, zIndex: 2 }}>
        <Label mono style={styles.cardLabel}>
          CLUB MEMBER
        </Label>
        <Pressable
          accessibilityRole={onEditName ? "button" : undefined}
          accessibilityLabel={onEditName ? `Edit username, currently ${name}` : name}
          disabled={!onEditName}
          onPress={onEditName}
          style={styles.nameRow}
        >
          <Label heading style={styles.memberName}>
            {name}
          </Label>
          {onEditName && <Pencil color={colors.muted} size={14} />}
        </Pressable>
      </View>
      <View style={styles.footer}>
        <Label mono style={styles.cardLabel}>
          BIG TWO CREW / 鋤大弟 CREW
        </Label>
        <Label mono style={styles.cardLabel}>
          ♠ · ♥ · ♣ · ♦
        </Label>
      </View>
    </LinearGradient>
  );
}

export interface ProfileScreenProps {
  session: HomeSession | null;
  onHome: () => void;
  initialEditor?: "delete";
}
export function ProfileScreen({ session, onHome, initialEditor }: ProfileScreenProps) {
  const user = session?.user;
  const [saved, setSaved] = useState({
    name: user?.displayUsername ?? user?.username ?? user?.name ?? "Member",
    emoji: user?.emoji ?? "♠️",
    username: user?.displayUsername ?? user?.username ?? "",
  });
  const [name, setName] = useState(saved.name);
  const [emoji, setEmoji] = useState(saved.emoji);
  const [editor, setEditor] = useState<"name" | "emoji" | "delete" | null>(initialEditor ?? null);
  const [inspecting, setInspecting] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const open = (next: typeof editor) => {
    setName(saved.name);
    setEmoji(saved.emoji);
    setError(null);
    setNotice(null);
    setConfirmation("");
    setEditor(next);
  };
  const cancel = () => {
    if (!busy) {
      setName(saved.name);
      setEmoji(saved.emoji);
      setError(null);
      setEditor(null);
    }
  };
  const save = async () => {
    const normalized = name.trim().normalize("NFC");
    const validation = editor === "name" ? usernameError(normalized) : undefined;
    if (validation) {
      setError(validation);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const nextUsername = editor === "name" ? normalized : saved.username;
      const result = await authClient.updateUser({
        name: editor === "name" ? normalized : saved.name,
        ...(nextUsername ? { username: nextUsername, displayUsername: nextUsername } : {}),
        emoji,
      });
      if (result.error) {
        setError(result.error.message ?? "Couldn’t save your profile. Please try again.");
        return;
      }
      setSaved({
        name: editor === "name" ? normalized : saved.name,
        username: nextUsername,
        emoji,
      });
      setEditor(null);
      setNotice("Profile updated!");
    } catch {
      setError("Couldn’t save your profile. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (confirmation !== "DELETE") return;
    setBusy(true);
    setError(null);
    try {
      const result = await authClient.deleteUser();
      if (result.error) {
        setError(
          result.error.message ??
            "We couldn’t delete the account. Sign out, sign back in, and try again.",
        );
        return;
      }
      setEditor(null);
      onHome();
    } catch {
      setError("We couldn’t delete the account. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <CasinoScreen scroll>
      <View style={styles.nav}>
        <Button title="‹ Home" onPress={onHome} />
      </View>
      {user ? (
        <View style={styles.content}>
          <MembershipCard
            name={editor === "name" ? name.trim() || saved.name : saved.name}
            emoji={editor === "emoji" ? emoji : saved.emoji}
            onEditName={() => open("name")}
            onEditEmoji={() => open("emoji")}
            onInspect={() => setInspecting(true)}
          />
          <Label style={styles.caption}>Your seat at the members’ table.</Label>
          {notice && <Label style={styles.notice}>{notice}</Label>}
          <Label style={styles.email}>{user.email}</Label>
          <Button
            title="Account & data deletion"
            onPress={() => open("delete")}
            style={styles.deleteLink}
            ghost
          />
        </View>
      ) : (
        <Label>Sign in to manage your profile.</Label>
      )}
      <Sheet
        visible={editor !== null}
        onClose={cancel}
        title={
          editor === "emoji"
            ? "Choose your emoji"
            : editor === "delete"
              ? "Account & data deletion"
              : "Edit your username"
        }
      >
        {editor === "name" && (
          <>
            <Label style={styles.hint}>Your name at the members’ table.</Label>
            <Label>Username</Label>
            <Field
              accessibilityLabel="Username"
              value={name}
              onChangeText={(value) => {
                setName(value);
                setError(null);
              }}
              editable={!busy}
              maxLength={1024}
              autoCorrect={false}
              autoComplete="username"
            />
            <Label style={styles.hint}>
              3–30 characters. Any language, emoji, symbols, and spaces welcome.
            </Label>
          </>
        )}
        {editor === "emoji" && (
          <>
            <Label style={{ fontSize: 38, lineHeight: 48, textAlign: "center" }}>{emoji}</Label>
            <Label style={styles.hint}>
              A little personality for your membership card. Scroll for more — find your table
              personality.
            </Label>
            <ScrollView
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              style={styles.picker}
              contentContainerStyle={{ gap: 12 }}
            >
              {emojiGroups.map((group) => (
                <View key={group.label} style={{ gap: 8 }}>
                  <Label mono>{group.label}</Label>
                  <View style={styles.emojiGrid}>
                    {group.emojis.map((choice) => (
                      <Pressable
                        key={choice}
                        accessibilityRole="button"
                        accessibilityLabel={`Choose ${choice}`}
                        accessibilityState={{ selected: emoji === choice, disabled: busy }}
                        disabled={busy}
                        onPress={() => {
                          setEmoji(choice);
                          setError(null);
                        }}
                        style={[styles.emoji, emoji === choice && styles.emojiSelected]}
                      >
                        <Label style={{ fontSize: 25, lineHeight: 34 }}>{choice}</Label>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ))}
            </ScrollView>
          </>
        )}
        {editor === "delete" && (
          <>
            <Label style={{ fontFamily: fonts.strong }}>Signed in as {user?.email}</Label>
            <Label style={styles.hint}>
              Deleting your account permanently removes your profile, sign-in methods, and active
              sessions. Your name and account ID are also replaced with “Deleted player” in saved
              online rooms. Anonymised game state and security logs may be retained as needed to
              operate and protect the service. This cannot be undone. Local game data stored on your
              device can be removed separately by clearing the app storage.
            </Label>
            <Label>Type DELETE to confirm</Label>
            <Field
              accessibilityLabel="Type DELETE to confirm account deletion"
              value={confirmation}
              onChangeText={setConfirmation}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!busy}
            />
          </>
        )}
        <ErrorMessage message={error} />
        <View style={styles.actions}>
          <Button title="Cancel" disabled={busy} onPress={cancel} style={{ flex: 1 }} />
          {editor === "delete" ? (
            <Button
              title="Delete account"
              busy={busy}
              disabled={confirmation !== "DELETE" || busy}
              onPress={() => void remove()}
              style={[styles.destructive, { flex: 1 }]}
            />
          ) : (
            <Button
              title="Save changes"
              gold
              busy={busy}
              disabled={busy || (name.trim() === saved.name && emoji === saved.emoji)}
              onPress={() => void save()}
              style={{ flex: 1 }}
            />
          )}
        </View>
      </Sheet>
      <Sheet visible={inspecting} onClose={() => setInspecting(false)} title="Your membership card">
        <MembershipCard
          name={saved.name}
          emoji={saved.emoji}
          enlarged
          onInspect={() => setInspecting(false)}
        />
        <Label style={styles.caption}>
          Your seat at the members’ table. Tap the card to return to your profile.
        </Label>
      </Sheet>
    </CasinoScreen>
  );
}

const styles = StyleSheet.create({
  nav: { width: "100%", maxWidth: 620, alignItems: "flex-start" },
  content: {
    width: "100%",
    maxWidth: 440,
    gap: 16,
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 16,
  },
  card: {
    width: "100%",
    minHeight: 252,
    borderWidth: 1,
    borderColor: "#e5cb92",
    borderRadius: 18,
    padding: 24,
    gap: 20,
    overflow: "hidden",
    boxShadow: "0 20px 35px -10px #000a",
  },
  frame: {
    position: "absolute",
    top: 9,
    bottom: 9,
    left: 9,
    right: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#dcb87566",
  },
  inspectTarget: { ...StyleSheet.absoluteFillObject, zIndex: 1 },
  enlargedCard: { minHeight: 300, padding: 28, gap: 35 },
  watermark: { position: "absolute", width: 148, height: 148, right: 15, top: 46, opacity: 0.12 },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    pointerEvents: "box-none",
    zIndex: 2,
  },
  cardBrand: { flexDirection: "row", alignItems: "center", height: 60, opacity: 0.85 },
  seal: {
    zIndex: 2,
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "#e5cb92bb",
    backgroundColor: "#31503b",
    alignItems: "center",
    justifyContent: "center",
  },
  sealEdit: {
    position: "absolute",
    bottom: -3,
    right: -3,
    width: 23,
    height: 23,
    borderRadius: 12,
    backgroundColor: "#10291f",
    borderWidth: 1,
    borderColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  cardLabel: { fontSize: 8, lineHeight: 14, letterSpacing: 1, color: "#cfb989" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44, zIndex: 2 },
  memberName: { fontSize: 27, lineHeight: 34, flexShrink: 1, color: "#ffebbf" },
  footer: { flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap", gap: 8 },
  compact: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 14,
    minWidth: 160,
    maxWidth: 250,
    minHeight: 48,
    borderWidth: 1.5,
    borderColor: colors.gold,
    borderRadius: 20,
    borderBottomWidth: 3,
    borderBottomColor: colors.goldDark,
  },
  compactName: { fontSize: 18, lineHeight: 25, flexShrink: 1 },
  caption: { color: colors.muted, textAlign: "center", fontSize: 13 },
  email: { color: colors.muted, textAlign: "center", fontSize: 12 },
  notice: { color: colors.gold, textAlign: "center" },
  deleteLink: { borderWidth: 0, borderBottomWidth: 0, backgroundColor: "transparent" },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 21 },
  actions: { flexDirection: "row", gap: 10, paddingTop: 4 },
  destructive: { backgroundColor: "#5c1718", borderColor: "#d87565", borderBottomColor: "#391111" },
  emojiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  picker: { maxHeight: 300, flexShrink: 1 },
  emoji: {
    minWidth: 44,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: 12,
  },
  emojiSelected: { borderColor: colors.gold, backgroundColor: "#3e3d1c" },
});
