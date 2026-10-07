import { useRef, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RoomChatResult } from "../network";
import { Button, ErrorMessage, Field, Label } from "../ui/primitives";
import { StatusSlot } from "../ui/status-slot";
import { colors, fonts } from "../ui/theme";

export function ChatScreen({
  visible,
  roomId,
  chat,
  onClose,
}: {
  visible: boolean;
  roomId: string;
  chat: RoomChatResult;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const list = useRef<ScrollView>(null);
  const nearBottom = useRef(true);
  const submit = async () => {
    const text = draft.trim();
    if (!text || chat.sending) return;
    setSendError(null);
    try {
      await chat.send(text);
      setDraft((previous) => (previous === draft ? "" : previous));
      nearBottom.current = true;
    } catch (reason) {
      setSendError(
        reason instanceof Error ? reason.message : "Your message wasn’t sent. Retry below.",
      );
    }
  };
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.screen}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          enabled={Platform.OS === "ios"}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Label heading>Room chat</Label>
              <View testID="chat-connection-status">
                <Label
                  mono
                  accessible={false}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={{ opacity: 0 }}
                >
                  {roomId} · RECONNECTING
                </Label>
                <Label mono style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
                  {roomId} · {chat.connection === "connected" ? "LIVE" : "RECONNECTING"}
                </Label>
              </View>
            </View>
            <Button title="×" accessibilityLabel="Close room chat" onPress={onClose} />
          </View>
          <ScrollView
            ref={list}
            style={{ flex: 1, minHeight: 0 }}
            automaticallyAdjustKeyboardInsets={false}
            contentContainerStyle={styles.messages}
            keyboardShouldPersistTaps="handled"
            onScroll={({ nativeEvent }) => {
              nearBottom.current =
                nativeEvent.layoutMeasurement.height + nativeEvent.contentOffset.y >=
                nativeEvent.contentSize.height - 80;
            }}
            scrollEventThrottle={100}
            onContentSizeChange={() => {
              if (nearBottom.current) list.current?.scrollToEnd({ animated: true });
            }}
          >
            {chat.hasOlder && (
              <Button
                title="Older messages"
                busy={chat.loadingOlder}
                onPress={() => {
                  nearBottom.current = false;
                  void chat.loadOlder();
                }}
              />
            )}
            {!chat.loading && !chat.messages.length && (
              <Label style={{ color: colors.muted }}>No messages yet. Say hello to the crew.</Label>
            )}
            {chat.messages.map((message) => (
              <View key={message.id} style={styles.message}>
                <Label style={{ fontFamily: fonts.strong, color: colors.gold }}>
                  {message.author || "Deleted account"}
                  <Label mono style={{ fontSize: 9 }}>
                    {" "}
                    {message.role ?? ""}
                  </Label>
                </Label>
                <Label
                  selectable
                  style={{ color: message.role === null ? colors.muted : colors.cream }}
                >
                  {message.text || "Message removed"}
                </Label>
              </View>
            ))}
          </ScrollView>
          <View style={styles.composer}>
            <View style={styles.statusRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <StatusSlot testID="chat-status">
                  <ErrorMessage message={sendError ?? chat.error?.message} />
                </StatusSlot>
              </View>
              <View
                pointerEvents={chat.error ? "auto" : "none"}
                accessibilityElementsHidden={!chat.error}
                importantForAccessibility={chat.error ? "auto" : "no-hide-descendants"}
                style={{ opacity: chat.error ? 1 : 0, flexShrink: 0 }}
              >
                <Button
                  title="Retry"
                  accessibilityLabel="Retry connection"
                  disabled={!chat.error || chat.loading}
                  busy={chat.loading}
                  onPress={() => void chat.refresh()}
                />
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
              <Field
                accessibilityLabel="Chat message"
                placeholder="Message the crew…"
                value={draft}
                onChangeText={setDraft}
                multiline
                maxLength={2000}
                style={{ flex: 1, maxHeight: 110, paddingVertical: 12 }}
              />
              <Button
                title="Send"
                accessibilityLabel={sendError ? "Retry message" : "Send"}
                gold
                busy={chat.sending}
                disabled={!draft.trim() || chat.connection !== "connected"}
                onPress={() => void submit()}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  messages: { padding: 16, gap: 12 },
  message: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    borderRadius: 14,
    gap: 5,
  },
  composer: { padding: 12, gap: 8, borderTopWidth: 1, borderColor: colors.line },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 },
});
