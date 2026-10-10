import { useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
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
  const [sentIds, setSentIds] = useState<Set<string>>(() => new Set());
  const { height } = useWindowDimensions();
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const compact = (viewportHeight ?? height) < 480;
  const tight = (viewportHeight ?? height) < 260;
  const messageError = sendError ?? chat.error?.message;
  const list = useRef<ScrollView>(null);
  const nearBottom = useRef(true);
  const submit = async () => {
    const text = draft.trim();
    if (!text || chat.sending) return;
    setSendError(null);
    try {
      const message = await chat.send(text);
      setSentIds((previous) => new Set(previous).add(message.id));
      setDraft((previous) => (previous === draft ? "" : previous));
      nearBottom.current = true;
    } catch (reason) {
      setSendError(
        reason instanceof Error ? reason.message : "Your message wasn’t sent. Retry below.",
      );
    }
  };
  const closeButton = (
    <Button
      title="×"
      accessibilityLabel="Close room chat"
      onPress={onClose}
      style={tight && styles.tightButton}
    />
  );
  const statusRow = (
    <View style={styles.statusRow}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <StatusSlot testID="chat-status">
          <ErrorMessage message={messageError} />
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
  );
  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.screen}
        // Padding follows the current window size, including rotation while typing.
        behavior="padding"
      >
        <SafeAreaView style={{ flex: 1 }}>
          <View
            testID="chat-viewport"
            style={{ flex: 1, minHeight: 0 }}
            // Measure the space left by keyboard avoidance, not the changing message content.
            onLayout={({ nativeEvent }) => setViewportHeight(nativeEvent.layout.height)}
          >
            <View
              style={[styles.header, compact && styles.compactHeader, tight && styles.tightHeader]}
            >
              <View style={[{ flex: 1 }, tight && styles.tightHeaderLabels]}>
                <Label
                  heading
                  style={[compact && styles.compactHeading, tight && styles.tightHeading]}
                >
                  Room chat
                </Label>
                <View testID="chat-connection-status" style={tight && { flex: 1, minWidth: 0 }}>
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
              {!tight && closeButton}
            </View>
            <ScrollView
              ref={list}
              style={{ flex: 1, minHeight: 0 }}
              automaticallyAdjustKeyboardInsets={false}
              contentContainerStyle={[styles.messages, compact && styles.compactMessages]}
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
                <Label style={{ color: colors.muted }}>
                  No messages yet. Say hello to the crew.
                </Label>
              )}
              {chat.messages.map((message) => {
                const own = message.role !== null && (message.isOwn ?? sentIds.has(message.id));
                return (
                  <View
                    key={message.id}
                    testID={`chat-message-${message.id}`}
                    style={[
                      styles.message,
                      own && styles.ownMessage,
                      compact && styles.compactMessage,
                    ]}
                  >
                    <Label style={{ fontFamily: fonts.strong, color: colors.gold }}>
                      {own ? "You" : message.author || "Deleted account"}
                      <Label mono style={{ fontSize: 9 }}>
                        {" "}
                        {message.role ?? ""}
                      </Label>
                    </Label>
                    <Label
                      selectable
                      style={{
                        color: message.role === null ? colors.muted : colors.cream,
                        textAlign: "left",
                      }}
                    >
                      {message.text || "Message removed"}
                    </Label>
                  </View>
                );
              })}
              {tight && Boolean(messageError) && statusRow}
            </ScrollView>
            <View
              testID="chat-composer"
              style={[
                styles.composer,
                compact && styles.compactComposer,
                tight && styles.tightComposer,
              ]}
            >
              {!tight && (!compact || Boolean(messageError)) && statusRow}
              <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
                <Field
                  testID="chat-message-input"
                  accessibilityLabel="Chat message"
                  placeholder="Message the crew…"
                  value={draft}
                  onChangeText={setDraft}
                  multiline
                  disableFullscreenUI
                  maxLength={2000}
                  style={{
                    flex: 1,
                    minHeight: tight ? 44 : 48,
                    maxHeight: tight ? 48 : compact ? 72 : 110,
                    paddingVertical: compact ? 8 : 12,
                  }}
                />
                <Button
                  title="Send"
                  accessibilityLabel={sendError ? "Retry message" : "Send"}
                  gold
                  busy={chat.sending}
                  disabled={!draft.trim() || chat.connection !== "connected"}
                  onPress={() => void submit()}
                  style={tight && styles.tightButton}
                />
                {tight && closeButton}
              </View>
            </View>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    padding: 16,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  compactHeader: { paddingHorizontal: 12, paddingVertical: 8 },
  compactHeading: { fontSize: 20, lineHeight: 26 },
  tightHeader: { paddingVertical: 2 },
  tightHeaderLabels: { flexDirection: "row", alignItems: "center", gap: 12 },
  tightHeading: { fontSize: 18, lineHeight: 22 },
  tightButton: { minHeight: 44, paddingVertical: 6 },
  messages: { padding: 16, gap: 12 },
  compactMessages: { padding: 8, gap: 8 },
  message: {
    alignSelf: "flex-start",
    maxWidth: "86%",
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    borderRadius: 14,
    borderBottomLeftRadius: 5,
    gap: 5,
  },
  ownMessage: {
    alignSelf: "flex-end",
    backgroundColor: "#0c2c1c",
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 5,
  },
  compactMessage: { padding: 8, gap: 3 },
  composer: { padding: 12, gap: 8, flexShrink: 0, borderTopWidth: 1, borderColor: colors.line },
  compactComposer: { padding: 8, gap: 4 },
  tightComposer: { padding: 4 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 },
});
