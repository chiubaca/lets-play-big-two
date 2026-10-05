import { useState } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { ArrowRight, Bot, LogIn, UsersRound, Wifi } from "lucide-react-native";
import { authClient, useRooms } from "../network";
import { Brand } from "../ui/brand";
import { Button, CasinoScreen, ErrorMessage, Field, Label, Panel, Sheet } from "../ui/primitives";
import { colors, fonts } from "../ui/theme";
import { MembershipCard } from "./profile";

export interface HomeSession {
  user: {
    id: string;
    name: string;
    email: string;
    username?: string | null;
    displayUsername?: string | null;
    emoji?: string | null;
  };
}
export interface HomeScreenProps {
  session: HomeSession | null;
  pending: boolean;
  onSolo: () => void;
  onPassSetup: () => void;
  onRoom: (roomId: string) => void;
  onProfile: () => void;
  onDeleteAccount?: () => void;
  onAuth: () => void;
}

const privacySections = [
  {
    title: "Information we collect",
    copy: "If you create an account, we store your name, username, email address, authentication details, and optional profile image. Passwords are stored as secure hashes, not as readable passwords.\n\nWe process session information such as IP address, browser or device details, and sign-in cookies to secure your account and prevent abuse.\n\nWe process room codes, player names, and game actions needed to run online matches.\n\nBasic usage and diagnostic data may be collected to keep the service reliable and understand aggregate traffic.",
  },
  {
    title: "How we use information",
    copy: "We use this information to authenticate players, operate online rooms, maintain service security, respond to support requests, and improve reliability. We do not sell personal information or use it for targeted advertising.",
  },
  {
    title: "Service providers",
    copy: "Cloudflare provides hosting, security, analytics, real-time game infrastructure, and AI processing for the optional Jev opponent. If you choose Google sign-in, Google processes that sign-in under its own privacy policy. These providers receive only the information needed to deliver their services.",
  },
  {
    title: "Storage and retention",
    copy: "Account and authentication records are kept while your account is active. Operational records and security logs are retained only as needed to run and protect the service. If you delete your account, your player name and account ID are replaced in saved online rooms; anonymised game state may remain as an operational record. Local game state and preferences may remain on your device until you clear the app or browser data.",
  },
  {
    title: "Your choices",
    copy: "You can play local modes without an account. You can permanently delete an account and its associated authentication data from the account and data deletion page. You may also contact us with a privacy or deletion request.",
  },
  {
    title: "Children",
    copy: "Big Two Crew is not directed to children under 13, and we do not knowingly collect their personal information. Contact us if you believe a child has provided personal information.",
  },
  { title: "Contact", copy: "Questions or requests can be sent to alexchiu11@gmail.com." },
];

export function HomeScreen({
  session,
  pending,
  onSolo,
  onPassSetup,
  onRoom,
  onProfile,
  onDeleteAccount,
  onAuth,
}: HomeScreenProps) {
  const { width } = useWindowDimensions();
  const rooms = useRooms();
  const [roomCode, setRoomCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"create" | "signout" | null>(null);
  const [sheet, setSheet] = useState<"account" | "privacy" | null>(null);
  const displayName =
    session?.user.displayUsername ??
    session?.user.username ??
    session?.user.name.split(" ")[0] ??
    "Member";
  const create = async () => {
    if (!session || busy) return;
    setBusy("create");
    setError(null);
    try {
      const room = await rooms.createRoom();
      onRoom(room.roomId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn’t open a room. Please try again.");
    } finally {
      setBusy(null);
    }
  };
  const join = () => {
    const code = roomCode.trim().toUpperCase();
    if (!code) {
      setError("Enter the room code from your friend.");
      return;
    }
    // The room screen handles claiming a seat; navigating can also spectate a full table.
    setError(null);
    onRoom(code);
  };
  const signOut = async () => {
    setBusy("signout");
    setError(null);
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setError(result.error.message ?? "Couldn’t sign out. Please try again.");
        return;
      }
      setSheet(null);
      setRoomCode("");
    } catch {
      setError("Couldn’t sign out. Please try again.");
    } finally {
      setBusy(null);
    }
  };
  const profile = () => {
    setSheet(null);
    onProfile();
  };
  const deleteAccount = () => {
    setSheet(null);
    (onDeleteAccount ?? onProfile)();
  };

  return (
    <CasinoScreen scroll>
      <View style={[styles.nav, { width: Math.min(width - 28, 620) }]}>
        {session ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open account menu for ${displayName}`}
            onPress={() => {
              setError(null);
              setSheet("account");
            }}
          >
            <MembershipCard name={displayName} emoji={session.user.emoji ?? "♠️"} compact />
          </Pressable>
        ) : (
          <View>
            <Button
              title="Sign in"
              disabled={pending}
              busy={pending}
              onPress={onAuth}
              style={styles.signIn}
              labelStyle={{ fontSize: 12, lineHeight: 18 }}
            />
            {!pending && (
              <View pointerEvents="none" style={styles.signInIcon}>
                <LogIn color={colors.gold} size={16} />
              </View>
            )}
          </View>
        )}
      </View>
      <View style={styles.brand}>
        <Brand width={Math.min(width - 24, 410)} />
      </View>
      <View style={[styles.modes, { width: Math.min(width - 28, 520) }]}>
        <Mode
          title="Solo play"
          detail="Play offline against three opponents"
          icon="solo"
          onPress={onSolo}
        />
        <Mode
          title="Pass & Play"
          detail="Play together on one device"
          icon="pass"
          onPress={onPassSetup}
        />
        <Panel style={styles.online}>
          <View style={styles.onlineHeading}>
            <View style={styles.iconColumn}>
              <Wifi color={colors.gold} size={34} strokeWidth={1.8} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Label heading style={styles.onlineTitle}>
                Play with the crew
              </Label>
              <Label style={styles.modeDetail}>Create a room and play together in real time.</Label>
            </View>
          </View>
          {session ? (
            <>
              <Button
                title="＋ Create room"
                gold
                busy={busy === "create"}
                disabled={!!busy}
                onPress={() => void create()}
              />
              <Label style={styles.codeLabel}>Have a code?</Label>
              <View style={[styles.join, width <= 440 && styles.joinStack]}>
                <Field
                  accessibilityLabel="Room code"
                  value={roomCode}
                  maxLength={8}
                  placeholder="ABCDE"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  onChangeText={(value) => {
                    setRoomCode(value.toUpperCase());
                    setError(null);
                  }}
                  onSubmitEditing={join}
                  returnKeyType="go"
                  style={[styles.code, width <= 440 && styles.codeStack]}
                />
                <Button title="Join →" onPress={join} />
              </View>
              <ErrorMessage message={error} />
              <View style={styles.tables}>
                <View style={styles.tableHeading}>
                  <Label heading style={{ fontSize: 19, lineHeight: 26 }}>
                    Your tables
                  </Label>
                  <Label mono>{rooms.rooms.length}</Label>
                </View>
                {rooms.loading && rooms.rooms.length === 0 ? (
                  <Label style={styles.note}>Loading your tables…</Label>
                ) : rooms.error ? (
                  <>
                    <ErrorMessage message={rooms.error.message} />
                    <Button title="Try again" onPress={() => void rooms.refresh()} />
                  </>
                ) : rooms.rooms.length === 0 ? (
                  <Label style={styles.note}>No tables yet. Create one or join with a code.</Label>
                ) : (
                  rooms.rooms.map((room) => (
                    <Pressable
                      key={room.roomId}
                      accessibilityRole="button"
                      accessibilityLabel={`Open table ${room.roomId}, ${room.playerCount} of 4 players`}
                      onPress={() => onRoom(room.roomId)}
                      style={styles.table}
                    >
                      <View style={{ flex: 1, gap: 4 }}>
                        <Label mono style={{ color: colors.gold }}>
                          {room.roomId}
                        </Label>
                        <Label style={styles.note}>
                          {room.status === "waiting"
                            ? "Waiting for players"
                            : room.status === "finished"
                              ? "Game finished"
                              : "Game in progress"}{" "}
                          · {room.playerCount} / 4 players
                        </Label>
                      </View>
                      <ArrowRight color={colors.gold} size={18} />
                    </Pressable>
                  ))
                )}
              </View>
            </>
          ) : (
            <Button title="Sign in for multiplayer" gold disabled={pending} onPress={onAuth} />
          )}
        </Panel>
      </View>
      <View style={[styles.footer, { width: Math.min(width - 28, 520) }]}>
        <Label style={styles.legal}>© {new Date().getFullYear()} Big Two Crew</Label>
        <View style={styles.legalLinks}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setSheet("privacy")}
            style={styles.legalLink}
          >
            <Label style={styles.legal}>Privacy</Label>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={session ? deleteAccount : onAuth}
            style={styles.legalLink}
          >
            <Label style={styles.legal}>Account & data deletion</Label>
          </Pressable>
        </View>
      </View>
      <Sheet
        visible={sheet === "account"}
        onClose={() => {
          if (!busy) setSheet(null);
        }}
        title="Members’ table"
      >
        <Label>{displayName}</Label>
        <Button title="Profile" disabled={!!busy} onPress={profile} />
        <Button title="Delete account" disabled={!!busy} onPress={deleteAccount} />
        <Button
          title="Log out"
          busy={busy === "signout"}
          disabled={!!busy}
          onPress={() => void signOut()}
        />
        <ErrorMessage message={error} />
      </Sheet>
      <Sheet visible={sheet === "privacy"} onClose={() => setSheet(null)} title="Privacy policy">
        <Label mono>Effective 19 September 2026</Label>
        <Label style={styles.privacy}>
          This policy explains how Big Two Crew handles information when you play on the web or in
          the Android app. You can play solo or pass-and-play without creating an account.
        </Label>
        {privacySections.map((section) => (
          <View key={section.title} style={{ gap: 7 }}>
            <Label heading style={{ fontSize: 20, lineHeight: 28 }}>
              {section.title}
            </Label>
            <Label style={styles.privacy}>{section.copy}</Label>
          </View>
        ))}
        <Button
          title="Account & data deletion"
          onPress={() => {
            setSheet(null);
            if (session) deleteAccount();
            else onAuth();
          }}
        />
      </Sheet>
    </CasinoScreen>
  );
}

function Mode({
  title,
  detail,
  icon,
  onPress,
}: {
  title: string;
  detail: string;
  icon: "solo" | "pass";
  onPress: () => void;
}) {
  const Icon = icon === "solo" ? Bot : UsersRound;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail}`}
      onPress={onPress}
      style={({ pressed }) => pressed && { opacity: 0.85 }}
    >
      <Panel style={styles.mode}>
        <View pointerEvents="none" style={styles.innerBorder} />
        <View style={styles.iconColumn}>
          <Icon color={colors.gold} size={34} strokeWidth={1.8} />
        </View>
        <View style={styles.modeCopy}>
          <Label heading style={styles.modeTitle}>
            {title}
          </Label>
          <Label style={styles.modeDetail}>{detail}</Label>
        </View>
        <ArrowRight color={colors.gold} size={19} />
      </Panel>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  nav: { width: "100%", maxWidth: 620, alignItems: "flex-end", minHeight: 48 },
  signIn: {
    minHeight: 40,
    borderRadius: 20,
    paddingVertical: 6,
    paddingRight: 14,
    paddingLeft: 36,
  },
  signInIcon: { position: "absolute", left: 13, top: 11 },
  brand: { alignItems: "center", marginTop: 17, marginBottom: 4 },
  modes: { width: "100%", maxWidth: 520, gap: 18 },
  mode: {
    minHeight: 92,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 28,
    borderWidth: 2,
    borderBottomWidth: 2,
    borderBottomColor: "#e9bd69",
    boxShadow: "0 8px 0 #422708, 0 16px 24px #0009",
  },
  innerBorder: {
    position: "absolute",
    top: 4,
    bottom: 4,
    left: 4,
    right: 4,
    borderWidth: 1,
    borderColor: "#e9bd696b",
    borderRadius: 24,
  },
  modeCopy: { flex: 1, gap: 4 },
  modeTitle: { fontSize: 22, lineHeight: 25.3 },
  onlineTitle: { fontSize: 24, lineHeight: 31 },
  modeDetail: { fontSize: 12, lineHeight: 18, color: "#d1bfa2" },
  iconColumn: { width: 48, alignItems: "center", justifyContent: "center" },
  online: {
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderRadius: 38,
    borderWidth: 2,
    borderBottomWidth: 2,
    borderBottomColor: "#e9bd69",
    gap: 15,
    boxShadow: "0 8px 0 #422708, 0 16px 24px #0009",
  },
  onlineHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  join: { flexDirection: "row", gap: 8 },
  joinStack: { flexDirection: "column" },
  codeLabel: { color: colors.muted, fontSize: 12, marginBottom: -8 },
  code: { flex: 1, fontFamily: fonts.mono, letterSpacing: 3 },
  codeStack: { flex: 0, width: "100%" },
  tables: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 13, gap: 10 },
  tableHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  table: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: "#071e14",
    padding: 12,
    borderRadius: 14,
    minHeight: 65,
  },
  note: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  footer: { width: "100%", maxWidth: 520, alignItems: "center", paddingTop: 12, paddingBottom: 14 },
  legalLinks: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 15 },
  legalLink: { minHeight: 44, justifyContent: "center" },
  legal: { fontSize: 10, color: colors.muted },
  privacy: { fontSize: 13, lineHeight: 21, color: colors.muted },
});
