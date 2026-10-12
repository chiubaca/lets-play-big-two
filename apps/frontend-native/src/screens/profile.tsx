import { useEffect, useRef, useState, type Ref } from "react";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import {
  AccessibilityInfo,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  findNodeHandle,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { ChevronDown, Pencil } from "lucide-react-native";
import Animated from "react-native-reanimated";
import { GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import { authClient } from "../network";
import { Button, CasinoScreen, ErrorMessage, Field, Label, Sheet } from "../ui/primitives";
import { StatusSlot } from "../ui/status-slot";
import { colors, fonts, membershipArtwork } from "../ui/theme";
import {
  MembershipCardBrand,
  MembershipCardFinish,
  MembershipSealFinish,
} from "../ui/membership-card-finish";
import { Brand } from "../ui/brand";
import { MembershipCardInspector } from "../ui/membership-card-inspector";
import { useMembershipCardMotion } from "../ui/use-membership-card-motion";
import { MembershipCardFoil } from "../ui/membership-card-foil";
import type { MembershipCardPresentation } from "../ui/membership-card-motion";
import { usernameError } from "./auth";
import type { HomeSession } from "./home";
import { useQueryAccess } from "../network/query-client";

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
  interactive = true,
  inspectRef,
  presentation,
  initialSize,
  onEditName,
  onEditEmoji,
  onInspect,
}: {
  name: string;
  emoji: string;
  compact?: boolean;
  enlarged?: boolean;
  interactive?: boolean;
  inspectRef?: Ref<View>;
  presentation?: MembershipCardPresentation;
  initialSize?: { width: number; height: number };
  onEditName?: () => void;
  onEditEmoji?: () => void;
  onInspect?: () => void;
}) {
  const { width, fontScale } = useWindowDimensions();
  const narrow = width <= 380;
  const [measuredSize, setSize] = useState(initialSize ?? { width: 440, height: 266 });
  const size = enlarged && initialSize ? initialSize : measuredSize;
  const nameSize = Math.max(22, Math.min(30, width * 0.05));
  const motion = useMembershipCardMotion({
    enabled: !compact && interactive,
    enlarged,
    presentation,
    ...size,
  });
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
    <GestureHandlerRootView style={styles.cardStage}>
      <GestureDetector gesture={motion.gesture}>
        <View collapsable={false} {...motion.handlers}>
          <Animated.View
            collapsable={false}
            testID="profile-membership-card"
            renderToHardwareTextureAndroid={enlarged}
            shouldRasterizeIOS={enlarged}
            style={[
              styles.card,
              narrow && styles.narrowCard,
              enlarged && initialSize && { height: size.height },
              motion.frontStyle,
            ]}
            onLayout={({ nativeEvent: { layout } }) => {
              // Yoga rounds a scaled modal's bounds to a different pixel grid.
              // Preserve the preview's geometry and reuse its exact textures.
              if (enlarged && initialSize) return;
              if (layout.width !== size.width || layout.height !== size.height)
                setSize({ width: layout.width, height: layout.height });
            }}
          >
            <MembershipCardFinish {...size} narrow={narrow} />
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: (narrow ? 22 : 30) + 1,
                top: (narrow ? 24 : 28) + 1,
              }}
            >
              <MembershipCardBrand narrow={narrow} />
            </View>
            {/* The hidden preview must release its large textures while inspection
                owns the surface. Keep the inspected finish during its return. */}
            {(interactive || enlarged) && (
              <MembershipCardFoil {...size} light={motion.light} intensity={motion.intensity} />
            )}
            {onInspect && (
              <Pressable
                ref={inspectRef}
                accessibilityRole="button"
                accessibilityLabel={
                  enlarged ? "Return to your profile" : "Inspect your membership card"
                }
                onPress={() => {
                  if (motion.shouldActivate()) onInspect();
                }}
                style={styles.inspectTarget}
              />
            )}
            <View pointerEvents="box-none" style={[styles.top, narrow && { gap: 10 }]}>
              <View
                pointerEvents="none"
                accessible={false}
                style={{ width: narrow ? 150 : 182, height: narrow ? 54 : 64 }}
              />
              <Pressable
                accessibilityRole={onEditEmoji ? "button" : undefined}
                accessibilityLabel={
                  onEditEmoji
                    ? enlarged
                      ? "Return to your profile"
                      : "Edit profile emoji"
                    : `Profile emoji ${emoji}`
                }
                disabled={!onEditEmoji}
                onPress={() => {
                  if (motion.shouldActivate()) onEditEmoji?.();
                }}
                style={styles.seal}
              >
                <MembershipSealFinish />
                <Label
                  pointerEvents="none"
                  maxFontSizeMultiplier={1}
                  style={{ fontSize: 25, lineHeight: 38 }}
                >
                  {emoji}
                </Label>
                {onEditEmoji && (
                  <View style={styles.sealEdit}>
                    <Pencil color="#cfb989" size={12} />
                  </View>
                )}
              </Pressable>
            </View>
            <View pointerEvents="box-none" style={{ gap: 6, zIndex: 2 }}>
              <Label mono pointerEvents="none" style={styles.memberLabel}>
                CLUB MEMBER
              </Label>
              <Pressable
                accessibilityRole={onEditName ? "button" : undefined}
                accessibilityLabel={
                  onEditName
                    ? enlarged
                      ? "Return to your profile"
                      : `Edit username, currently ${name}`
                    : name
                }
                disabled={!onEditName}
                onPress={() => {
                  if (motion.shouldActivate()) onEditName?.();
                }}
                style={styles.nameRow}
              >
                <Label
                  heading
                  pointerEvents="none"
                  style={[
                    styles.memberName,
                    {
                      fontSize: nameSize,
                      lineHeight: nameSize * 1.2,
                      paddingRight: nameSize * 0.2 * Math.max(1, fontScale),
                    },
                  ]}
                >
                  {name}
                </Label>
                {onEditName && <Pencil color="#cfb989" size={13} />}
              </Pressable>
            </View>
            <View
              pointerEvents="none"
              style={[
                styles.footer,
                fontScale > 1.3 && { flexDirection: "column", alignItems: "flex-start" },
              ]}
            >
              <Label mono style={[styles.cardLabel, narrow && { letterSpacing: 0.64 }]}>
                BIG TWO CREW / 鋤大弟 CREW
              </Label>
              <Label mono style={[styles.suits, narrow && { letterSpacing: 0.64 }]}>
                {"♠\uFE0E · ♥\uFE0E · ♣\uFE0E · ♦\uFE0E"}
              </Label>
            </View>
          </Animated.View>
          {enlarged && (
            <Animated.View
              renderToHardwareTextureAndroid
              shouldRasterizeIOS
              pointerEvents="none"
              accessible={false}
              importantForAccessibility="no-hide-descendants"
              style={[styles.card, styles.cardBack, motion.backStyle]}
            >
              <MembershipCardFinish {...size} narrow={narrow} holographic={false} />
              <Brand
                sources={membershipArtwork}
                width={Math.min((size.height * 0.82) / 1.06, size.width * 0.8)}
                accessible={false}
              />
            </Animated.View>
          )}
        </View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

export interface ProfileValues {
  name: string;
  emoji: string;
  username: string;
}

export interface ProfileScreenProps {
  session: HomeSession | null;
  onHome: () => void;
  initialEditor?: "name" | "emoji" | "delete";
}

type ProfileMutation<Result, Variables> = Pick<
  UseMutationResult<Result, Error, Variables>,
  "isPending" | "error" | "mutateAsync" | "reset"
>;

export interface ProfileViewProps extends ProfileScreenProps {
  update: ProfileMutation<ProfileValues, ProfileValues>;
  deletion: ProfileMutation<void, void>;
  isCurrent: () => boolean;
  initialInspecting?: boolean;
}

export function ProfileScreen(props: ProfileScreenProps) {
  const access = useQueryAccess();
  const client = useQueryClient();
  const update = useMutation({
    mutationKey: [...access.scope, "profile", "update"],
    mutationFn: async (profile: ProfileValues) => {
      access.assertCurrent();
      const result = await authClient.updateUser({
        name: profile.name,
        ...(profile.username
          ? { username: profile.username, displayUsername: profile.username }
          : {}),
        emoji: profile.emoji,
      });
      if (result.error)
        throw new Error(result.error.message ?? "Couldn’t save your profile. Please try again.");
      if (!access.isCurrent()) throw new Error("Your session changed. Reopen your profile.");
      return profile;
    },
  });
  const deletion = useMutation({
    mutationKey: [...access.scope, "profile", "delete"],
    mutationFn: async () => {
      access.assertCurrent();
      const result = await authClient.deleteUser();
      if (result.error)
        throw new Error(
          result.error.message ??
            "We couldn’t delete the account. Sign out, sign back in, and try again.",
        );
    },
    onSuccess: async () => {
      await client.cancelQueries({ queryKey: access.scope });
      client.removeQueries({ queryKey: access.scope });
      if (access.isCurrent()) client.getMutationCache().clear();
    },
  });
  return (
    <ProfileView {...props} update={update} deletion={deletion} isCurrent={access.isCurrent} />
  );
}

export function ProfileView({
  session,
  onHome,
  initialEditor,
  initialInspecting = false,
  update,
  deletion,
  isCurrent,
}: ProfileViewProps) {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const user = session?.user;
  const [saved, setSaved] = useState<ProfileValues>({
    name: user?.displayUsername ?? user?.username ?? user?.name ?? "Member",
    emoji: user?.emoji ?? "♠️",
    username: user?.displayUsername ?? user?.username ?? "",
  });
  const [name, setName] = useState(saved.name);
  const [emoji, setEmoji] = useState(saved.emoji);
  const [editor, setEditor] = useState<"name" | "emoji" | "delete" | null>(initialEditor ?? null);
  const [inspecting, setInspecting] = useState(initialInspecting);
  const [inspectionPresented, setInspectionPresented] = useState(false);
  const { width } = useWindowDimensions();
  const preview = useRef<View>(null);
  const inspectButton = useRef<View>(null);
  const [cardSize, setCardSize] = useState({
    width: Math.min(440, width - 28),
    height: width <= 380 ? 252 : 266,
  });
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const busy = update.isPending || deletion.isPending;
  const open = (next: typeof editor) => {
    setName(saved.name);
    setEmoji(saved.emoji);
    setError(null);
    update.reset();
    deletion.reset();
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
    setError(null);
    try {
      const nextUsername = editor === "name" ? normalized : saved.username;
      const result = await update.mutateAsync({
        name: editor === "name" ? normalized : saved.name,
        username: nextUsername,
        emoji,
      });
      if (!mounted.current || !isCurrent()) return;
      setSaved(result);
      setEditor(null);
      setNotice("Profile updated!");
    } catch {
      /* The mutation exposes the failed save without discarding the draft. */
    }
  };
  const remove = async () => {
    if (confirmation !== "DELETE" || busy) return;
    setError(null);
    try {
      await deletion.mutateAsync();
      if (!mounted.current) return;
      setEditor(null);
      onHome();
    } catch {
      /* Keep confirmation and show the mutation error for an explicit retry. */
    }
  };

  return (
    <CasinoScreen scroll>
      <View style={styles.nav}>
        <Button title="‹ Home" onPress={onHome} />
      </View>
      {user ? (
        <View style={styles.content}>
          <View
            ref={preview}
            collapsable={false}
            pointerEvents={inspecting ? "none" : "box-none"}
            importantForAccessibility={inspecting ? "no-hide-descendants" : "auto"}
            style={{ width: "100%", opacity: inspectionPresented ? 0 : 1 }}
            onLayout={({ nativeEvent: { layout } }) =>
              setCardSize({ width: layout.width, height: layout.height })
            }
          >
            <MembershipCard
              name={editor === "name" ? name.trim() || saved.name : saved.name}
              emoji={editor === "emoji" ? emoji : saved.emoji}
              onEditName={() => open("name")}
              onEditEmoji={() => open("emoji")}
              interactive={!inspectionPresented}
              inspectRef={inspectButton}
              onInspect={() => setInspecting(true)}
            />
          </View>
          <Label style={styles.caption}>Your seat at the members’ table.</Label>
          <StatusSlot testID="profile-notice">
            {notice && (
              <Label accessibilityLiveRegion="polite" style={styles.notice}>
                {notice}
              </Label>
            )}
          </StatusSlot>
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
                update.reset();
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
                          update.reset();
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
        <StatusSlot testID="profile-editor-status">
          <ErrorMessage
            message={
              error ?? (editor === "delete" ? deletion.error?.message : update.error?.message)
            }
          />
        </StatusSlot>
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
      <MembershipCardInspector
        visible={inspecting}
        size={cardSize}
        measureAnchor={(done) => {
          if (!preview.current) {
            done(null);
            return;
          }
          preview.current.measureInWindow((x, y, width, height) => {
            if (mounted.current) done({ x, y, width, height });
          });
        }}
        onReady={() => setInspectionPresented(true)}
        onClose={() => {
          setInspectionPresented(false);
          setInspecting(false);
        }}
        onRestoreFocus={() => {
          const node = findNodeHandle(inspectButton.current);
          if (node) AccessibilityInfo.setAccessibilityFocus(node);
        }}
        renderCard={(close, interactive, presentation) => (
          <MembershipCard
            name={saved.name}
            emoji={saved.emoji}
            enlarged
            interactive={interactive}
            presentation={presentation}
            initialSize={cardSize}
            onInspect={close}
            onEditName={close}
            onEditEmoji={close}
          />
        )}
      />
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
    paddingTop: 28,
    paddingHorizontal: 30,
    paddingBottom: 22,
    gap: 26,
    justifyContent: "space-between",
    overflow: "hidden",
    backgroundColor: "#071b15",
    isolation: "isolate",
    backfaceVisibility: "hidden",
    boxShadow: "0 24px 48px -12px #000a, 0 0 32px -12px #dcb87544",
  },
  cardStage: { width: "100%" },
  cardBack: {
    ...StyleSheet.absoluteFill,
    padding: 0,
    gap: 0,
    minHeight: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  narrowCard: { paddingTop: 24, paddingHorizontal: 22, paddingBottom: 20, gap: 22 },
  inspectTarget: { ...StyleSheet.absoluteFill, zIndex: 1 },
  top: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 18,
    pointerEvents: "box-none",
    zIndex: 2,
  },
  seal: {
    zIndex: 2,
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 1,
    borderColor: "#e5cb92bb",
    backgroundColor: "#153426",
    boxShadow: "0 3px 10px #0005",
    alignItems: "center",
    justifyContent: "center",
  },
  sealEdit: {
    position: "absolute",
    bottom: -2,
    right: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#081d16",
    borderWidth: 1,
    borderColor: "#dcb87588",
    alignItems: "center",
    justifyContent: "center",
  },
  memberLabel: { fontSize: 9, lineHeight: 13.5, letterSpacing: 1.44, color: "#cfb989" },
  cardLabel: { fontSize: 8, lineHeight: 12, letterSpacing: 1.28, color: "#cfb989", flexShrink: 1 },
  suits: { fontSize: 12, lineHeight: 19.5, letterSpacing: 1.28, color: "#e7c98a", flexShrink: 0 },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    maxWidth: "100%",
    gap: 12,
    minHeight: 44,
    zIndex: 2,
  },
  memberName: {
    fontFamily: "FrauncesMedium",
    flexShrink: 1,
    color: "#ffebbf",
    textShadowColor: "#0009",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 2,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#dcb87533",
    zIndex: 2,
  },
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
