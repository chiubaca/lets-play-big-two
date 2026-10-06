import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type TextProps,
  type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { artwork, colors, fonts } from "./theme";

export function Label({
  children,
  style,
  heading = false,
  mono = false,
  ...props
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
  heading?: boolean;
  mono?: boolean;
} & Omit<TextProps, "children" | "style">) {
  return (
    <Text
      accessibilityRole={heading ? "header" : undefined}
      {...props}
      style={[styles.text, heading && styles.heading, mono && styles.mono, style]}
    >
      {children}
    </Text>
  );
}

export function CasinoScreen({
  children,
  scroll = false,
  backdrop,
}: {
  children: ReactNode;
  scroll?: boolean;
  backdrop?: ReactNode;
}) {
  return (
    <View style={[styles.screen, { backgroundColor: colors.background, overflow: "hidden" }]}>
      {backdrop ?? <CasinoBackdrop />}
      <SafeAreaView style={styles.screen}>
        {scroll ? (
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        ) : (
          children
        )}
      </SafeAreaView>
    </View>
  );
}

export function CasinoBackdrop({
  blurRadius = 0,
  overscan = 0,
}: {
  blurRadius?: number;
  overscan?: number;
}) {
  const { width, height } = useWindowDimensions();
  const landscape = width > 760 && width > height;
  const ratio = landscape ? 1672 / 941 : 1024 / 1536;
  const backdropHeight = Math.max(height + overscan * 2, (width + overscan * 2) / ratio);
  const backdropWidth = backdropHeight * ratio;
  return (
    <Image
      accessible={false}
      blurRadius={blurRadius}
      source={landscape ? artwork.landscape : artwork.portrait}
      resizeMode="stretch"
      style={{
        position: "absolute",
        top: landscape && overscan ? (height - backdropHeight) / 2 : -overscan,
        left: (width - backdropWidth) / 2,
        width: backdropWidth,
        height: backdropHeight,
      }}
    />
  );
}

export function Panel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <LinearGradient colors={["#172d1e", "#07170e"]} style={[styles.panel, style]}>
      {children}
    </LinearGradient>
  );
}

export function Button({
  title,
  onPress,
  gold = false,
  disabled = false,
  busy = false,
  style,
  accessibilityLabel,
  labelStyle,
  ghost = false,
  icon,
  disabledAppearance = "fade",
}: {
  title: string;
  onPress: () => void;
  gold?: boolean;
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  labelStyle?: StyleProp<TextStyle>;
  ghost?: boolean;
  icon?: ReactNode;
  disabledAppearance?: "fade" | "muted";
}) {
  const muted = (disabled || busy) && disabledAppearance === "muted";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        gold && styles.goldButton,
        ghost && styles.ghostButton,
        (disabled || busy) && disabledAppearance === "fade" && styles.disabled,
        muted && gold && { borderColor: "#c5b88e", borderBottomColor: "#9e7e49" },
        pressed && styles.pressed,
        style,
      ]}
    >
      {!ghost && (
        <LinearGradient
          pointerEvents="none"
          colors={
            gold
              ? muted
                ? ["#c5b88e", "#baa16a", "#9e7e49"]
                : ["#ffdc87", "#f5b943", "#d68a1c"]
              : ["#192014", "#000703"]
          }
          locations={gold ? [0, 0.55, 1] : [0, 0.75]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.2, y: 1 }}
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: StyleSheet.flatten([styles.button, style]).borderRadius },
          ]}
        />
      )}
      {busy ? (
        <ActivityIndicator color={gold ? colors.panel : colors.gold} />
      ) : icon ? (
        <View style={{ position: "relative", zIndex: 1 }}>{icon}</View>
      ) : (
        <Label
          style={[
            styles.buttonText,
            gold && { color: "#111510" },
            muted && !gold && { color: "#b5a978" },
            labelStyle,
          ]}
        >
          {title}
        </Label>
      )}
    </Pressable>
  );
}

export function Field(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor="#8d917c"
      selectionColor={colors.gold}
      {...props}
      style={[styles.input, props.style]}
    />
  );
}

export function ErrorMessage({ message }: { message?: string | null }) {
  return message ? (
    <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>
      {message}
    </Text>
  ) : null;
}

export function Sheet({
  title,
  visible,
  onClose,
  children,
}: {
  title: string;
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.overlay}
      >
        <SafeAreaView style={styles.sheetSafe}>
          <Panel style={styles.sheet}>
            <View style={styles.row}>
              <Label heading style={{ flex: 1 }}>
                {title}
              </Label>
              <Button
                title="×"
                accessibilityLabel={`Close ${title}`}
                onPress={onClose}
                style={styles.close}
              />
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: 14, paddingBottom: 4 }}
            >
              {children}
            </ScrollView>
          </Panel>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "transparent" },
  scroll: { flexGrow: 1, padding: 14, gap: 16, alignItems: "center" },
  text: { fontFamily: fonts.body, color: colors.cream, fontSize: 14, lineHeight: 21 },
  heading: { fontFamily: fonts.display, fontSize: 25, lineHeight: 32 },
  mono: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1.5, color: colors.muted },
  panel: {
    borderWidth: 2,
    borderColor: "#e9bd69",
    borderRadius: 28,
    padding: 18,
    gap: 12,
    borderBottomWidth: 4,
    borderBottomColor: colors.goldDark,
  },
  button: {
    overflow: "hidden",
    minHeight: 46,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: colors.gold,
    backgroundColor: colors.panel,
    justifyContent: "center",
    alignItems: "center",
    borderBottomWidth: 3,
    borderBottomColor: colors.goldDark,
  },
  goldButton: { backgroundColor: colors.gold, borderColor: "#ffe6a0" },
  ghostButton: { borderWidth: 0, borderBottomWidth: 0, backgroundColor: "transparent" },
  buttonText: { color: colors.gold, fontFamily: fonts.display, fontSize: 18 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.8, transform: [{ translateY: 1 }] },
  input: {
    color: colors.cream,
    fontFamily: fonts.body,
    fontSize: 16,
    backgroundColor: "#020b07b8",
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#eccb7e66",
    borderRadius: 11,
    paddingHorizontal: 14,
  },
  error: { color: "#ffb3a8", fontFamily: fonts.body, fontSize: 13, lineHeight: 20 },
  overlay: { flex: 1, backgroundColor: "rgba(0,5,2,0.6)", justifyContent: "center", padding: 16 },
  sheetSafe: { width: "100%", maxWidth: 520, alignSelf: "center", maxHeight: "92%" },
  sheet: { flexShrink: 1, padding: 20, borderRadius: 22 },
  row: { flexDirection: "row", gap: 10, alignItems: "center" },
  close: { width: 46, paddingHorizontal: 0, borderRadius: 23 },
});
