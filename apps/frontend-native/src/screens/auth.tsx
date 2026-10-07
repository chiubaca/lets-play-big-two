import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AtSign, KeyRound, Mail } from "lucide-react-native";
import Svg, { Path } from "react-native-svg";
import { authClient } from "../network";
import { NATIVE_ORIGIN } from "../network/config";
import { Button, ErrorMessage, Field, Label, Sheet } from "../ui/primitives";
import { StatusSlot } from "../ui/status-slot";
import { colors, fonts } from "../ui/theme";

export interface AuthSuccessUser {
  id?: string;
  displayName?: string;
}
export interface AuthSheetProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (user: AuthSuccessUser) => void;
  callbackURL?: string;
}

export function usernameError(value: string): string | undefined {
  const name = value.trim().normalize("NFC");
  const length =
    typeof Intl.Segmenter === "function"
      ? Array.from(new Intl.Segmenter("en", { granularity: "grapheme" }).segment(name)).length
      : Array.from(name).length;
  if (name.length > 1024 || length < 3 || length > 30)
    return "Use 3–30 characters for your username.";
  if (/[\p{Cc}\p{Zl}\p{Zp}]/u.test(name))
    return "Usernames can’t contain line breaks or control characters.";
  return undefined;
}

export function AuthSheet({
  visible,
  onClose,
  onSuccess,
  callbackURL = NATIVE_ORIGIN,
}: AuthSheetProps) {
  const [signUp, setSignUp] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"email" | "google" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data: session } = authClient.useSession();
  const awaitingSocial = useRef(false);
  useEffect(() => {
    if (!visible || !session || !awaitingSocial.current) return;
    awaitingSocial.current = false;
    setBusy(null);
    setPassword("");
    onSuccess({
      id: session.user.id,
      displayName: session.user.displayUsername ?? session.user.username ?? session.user.name,
    });
  }, [visible, session, onSuccess]);

  const submit = async () => {
    const validation =
      (signUp ? usernameError(username) : undefined) ??
      (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? "Enter a valid email" : undefined) ??
      (!password
        ? "Password is required"
        : signUp && password.length < 8
          ? "Use at least 8 characters"
          : undefined);
    if (validation) {
      setError(validation);
      return;
    }
    setError(null);
    setBusy("email");
    try {
      const name = username.trim().normalize("NFC");
      const result = signUp
        ? await authClient.signUp.email({ email: email.trim(), password, name, username: name })
        : await authClient.signIn.email({ email: email.trim(), password });
      if (result.error) {
        setError(result.error.message ?? "We couldn’t sign you in.");
        return;
      }
      setPassword("");
      const user = result.data?.user;
      onSuccess({
        id: user?.id,
        displayName: user?.displayUsername ?? user?.username ?? user?.name ?? name,
      });
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const google = async () => {
    setBusy("google");
    setError(null);
    awaitingSocial.current = true;
    try {
      // expoClient opens the system authentication session and persists the callback cookie.
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL,
      });
      if (result.error) {
        awaitingSocial.current = false;
        setError(result.error.message ?? "Google sign-in couldn’t complete. Please try again.");
      }
    } catch {
      awaitingSocial.current = false;
      setError("Google sign-in couldn’t complete. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const close = () => {
    if (busy) return;
    awaitingSocial.current = false;
    setPassword("");
    setError(null);
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={close} title="Members’ table">
      <View style={styles.heading}>
        <Label style={styles.chip}>♠</Label>
        <View style={{ flex: 1, gap: 5 }}>
          <Label heading style={{ fontSize: 30, lineHeight: 38 }}>
            {signUp ? "Join the club" : "Take your seat"}
          </Label>
          <Label style={styles.note}>
            {signUp
              ? "Create an account for private multiplayer tables."
              : "Sign in to create a private online room or join your friends."}
          </Label>
        </View>
      </View>
      {signUp && (
        <View style={styles.field}>
          <Label style={styles.fieldLabel}>Username</Label>
          <View>
            <Field
              accessibilityLabel="Username"
              value={username}
              onChangeText={setUsername}
              placeholder="cardsharp42"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              maxLength={1024}
              editable={!busy}
              style={styles.input}
            />
            <View pointerEvents="none" style={styles.inputIcon}>
              <AtSign color="#a99d6e" size={15} />
            </View>
          </View>
          <Label style={styles.hint}>
            3–30 characters. Any language, emoji, symbols, and spaces welcome.
          </Label>
        </View>
      )}
      <View style={styles.field}>
        <Label style={styles.fieldLabel}>Email</Label>
        <View>
          <Field
            accessibilityLabel="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            editable={!busy}
            style={styles.input}
          />
          <View pointerEvents="none" style={styles.inputIcon}>
            <Mail color="#a99d6e" size={15} />
          </View>
        </View>
      </View>
      <View style={styles.field}>
        <Label style={styles.fieldLabel}>Password</Label>
        <View>
          <Field
            accessibilityLabel="Password"
            value={password}
            onChangeText={setPassword}
            placeholder={signUp ? "At least 8 characters" : "Your password"}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete={signUp ? "new-password" : "current-password"}
            editable={!busy}
            onSubmitEditing={() => {
              if (!busy) void submit();
            }}
            returnKeyType="go"
            style={styles.input}
          />
          <View pointerEvents="none" style={styles.inputIcon}>
            <KeyRound color="#a99d6e" size={15} />
          </View>
        </View>
      </View>
      <StatusSlot testID="auth-status">
        <ErrorMessage message={error} />
      </StatusSlot>
      <Button
        title={signUp ? "Create account" : "Sign in"}
        gold
        busy={busy === "email"}
        disabled={!!busy || !email.trim() || !password || (signUp && !username.trim())}
        onPress={() => void submit()}
      />
      <View style={styles.divider}>
        <View style={styles.line} />
        <Label style={styles.note}>or</Label>
        <View style={styles.line} />
      </View>
      <View>
        <Button
          title="Continue with Google"
          busy={busy === "google"}
          disabled={!!busy}
          onPress={() => void google()}
          style={{ paddingLeft: 42 }}
          labelStyle={{ fontSize: 16 }}
        />
        {busy !== "google" && (
          <View pointerEvents="none" style={styles.googleIcon}>
            <Svg width={19} height={19} viewBox="0 0 24 24">
              <Path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <Path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <Path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                fill="#FBBC05"
              />
              <Path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </Svg>
          </View>
        )}
      </View>
      <Label style={[styles.note, { textAlign: "center" }]}>
        {signUp ? "Already a member?" : "New to the table?"}
      </Label>
      <Pressable
        accessibilityRole="button"
        disabled={!!busy}
        onPress={() => {
          setSignUp(!signUp);
          setUsername("");
          setEmail("");
          setPassword("");
          setError(null);
        }}
        style={styles.switch}
      >
        <Label style={{ color: colors.gold, fontFamily: fonts.strong }}>
          {signUp ? "Sign in" : "Create an account"}
        </Label>
      </Pressable>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  heading: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 4 },
  chip: {
    fontFamily: fonts.display,
    fontSize: 23,
    lineHeight: 46,
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.gold,
    backgroundColor: "#03110a",
    textAlign: "center",
    color: colors.gold,
  },
  field: { gap: 6 },
  fieldLabel: { fontSize: 11, lineHeight: 17, color: colors.muted },
  input: { paddingLeft: 39 },
  inputIcon: { position: "absolute", top: 16, left: 13 },
  googleIcon: { position: "absolute", top: 13, left: 20 },
  note: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  hint: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  divider: { flexDirection: "row", gap: 14, alignItems: "center" },
  line: { height: 1, backgroundColor: colors.line, flex: 1 },
  switch: { minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: -12 },
});
