import { useRef, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RoomChatResult } from "../network";
import { Button, ErrorMessage, Field, Label } from "../ui/primitives";
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
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Label heading>Room chat</Label>
              <Label mono>
                {roomId} · {chat.connection === "connected" ? "LIVE" : "RECONNECTING"}
              </Label>
            </View>
            <Button title="×" accessibilityLabel="Close room chat" onPress={onClose} />
          </View>
          <ScrollView
            ref={list}
            style={{ flex: 1 }}
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
            <ErrorMessage message={sendError ?? chat.error?.message} />
            {chat.error && <Button title="Retry connection" onPress={() => void chat.refresh()} />}
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
                title={sendError ? "Retry" : "Send"}
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
});
